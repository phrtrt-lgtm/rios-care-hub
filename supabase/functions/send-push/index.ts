import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

interface SendPushRequest {
  ownerId: string;
  payload: PushPayload;
}

// Get OAuth2 access token from Firebase Service Account
async function getAccessToken(): Promise<string> {
  const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_KEY")!;
  const serviceAccount = JSON.parse(serviceAccountJson);

  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 3600;

  // Import private key
  const pemKey = serviceAccount.private_key;
  const pemContents = pemKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '');
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  // Create JWT header and payload
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: expiry,
    iat: now,
  };

  // Base64url encode (not standard base64)
  const base64url = (input: string) => {
    return btoa(input)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  // Sign the token
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const encodedSignature = base64url(String.fromCharCode(...new Uint8Array(signature)));
  const jwt = `${unsignedToken}.${encodedSignature}`;

  // Exchange JWT for access token
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Token exchange failed:", errorText);
    throw new Error(`Failed to get access token: ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Send push notification via Firebase FCM v1 API
async function sendFirebasePush(
  token: string,
  payload: PushPayload
): Promise<boolean> {
  try {
    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_KEY")!;
    const serviceAccount = JSON.parse(serviceAccountJson);
    const projectId = serviceAccount.project_id;

    const accessToken = await getAccessToken();

    console.log("Sending Firebase push to token:", token.substring(0, 20) + "...");

    const message = {
      message: {
        token: token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: {
          url: payload.url || "",
          tag: payload.tag || "",
        },
        android: {
          priority: "high",
          notification: {
            channel_id: "high_importance_channel",
            tag: payload.tag || undefined,
            notification_priority: "PRIORITY_MAX",
            visibility: "PUBLIC",
            sound: "default",
            default_vibrate_timings: true,
          },
        },
        webpush: {
          headers: {
            Urgency: "high",
          },
          fcm_options: payload.url ? {
            link: payload.url,
          } : undefined,
        },
      },
    };

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(message),
      }
    );

    console.log("Firebase push response status:", response.status);

    if (!response.ok) {
      const text = await response.text();
      console.error("Firebase push error:", text);
      
      // Check if token is invalid or not registered
      if (text.includes("NOT_FOUND") || text.includes("INVALID_ARGUMENT")) {
        return false; // Token is invalid, should be removed
      }
    }

    return response.ok;
  } catch (error) {
    console.error("Error sending Firebase push:", error);
    return false;
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { ownerId, payload }: SendPushRequest = await req.json();

    console.log("Sending push notification to owner:", ownerId);

    // Get all active subscriptions for the owner
    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("is_active", true);

    if (error) throw error;

    if (!subscriptions || subscriptions.length === 0) {
      console.log("No active subscriptions found for owner:", ownerId);
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

    let successCount = 0;

    // Send to all subscriptions - assuming fcm_token is stored in endpoint field
    for (const sub of subscriptions) {
      try {
        // Extract FCM token from endpoint (format: https://fcm.googleapis.com/fcm/send/TOKEN)
        let fcmToken = sub.endpoint;
        if (fcmToken.includes('fcm/send/')) {
          fcmToken = fcmToken.split('fcm/send/')[1];
        }
        
        const success = await sendFirebasePush(fcmToken, payload);
        
        if (success) {
          successCount++;
        } else {
          // Mark as inactive if push failed
          await supabase
            .from("push_subscriptions")
            .update({ is_active: false })
            .eq("id", sub.id);
        }
      } catch (error: any) {
        console.error("Error sending push to subscription:", error);
        
        // Mark as inactive if subscription is no longer valid
        await supabase
          .from("push_subscriptions")
          .update({ is_active: false })
          .eq("id", sub.id);
      }
    }

    console.log(`Sent ${successCount} push notifications to owner ${ownerId}`);

    return new Response(JSON.stringify({ success: true, sent: successCount }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-push function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
