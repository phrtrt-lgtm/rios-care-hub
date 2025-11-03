import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v5.9.6/index.ts";

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

// Helper to convert base64url to Uint8Array
function base64UrlToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload
): Promise<boolean> {
  try {
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const vapidEmail = Deno.env.get("VAPID_EMAIL")!;

    console.log("Sending push to endpoint:", subscription.endpoint);

    // Parse endpoint to get audience
    const url = new URL(subscription.endpoint);
    const audience = `${url.protocol}//${url.host}`;

    // Decode the VAPID keys
    const publicKeyBytes = base64UrlToUint8Array(vapidPublicKey);
    const privateKeyBytes = base64UrlToUint8Array(vapidPrivateKey);

    // Create JWK for signing
    const jwk: jose.JWK = {
      kty: "EC",
      crv: "P-256",
      x: jose.base64url.encode(publicKeyBytes.slice(1, 33)),
      y: jose.base64url.encode(publicKeyBytes.slice(33, 65)),
      d: jose.base64url.encode(privateKeyBytes),
    };

    // Import the key
    const privateKey = await jose.importJWK(jwk, "ES256");

    // Create and sign the JWT
    const jwt = await new jose.SignJWT({})
      .setProtectedHeader({ alg: "ES256", typ: "JWT" })
      .setAudience(audience)
      .setSubject(`mailto:${vapidEmail}`)
      .setExpirationTime("12h")
      .sign(privateKey);

    console.log("JWT created successfully");

    // Send the push notification
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Encoding": "aes128gcm",
        TTL: "86400",
        Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
      },
      body: JSON.stringify(payload),
    });

    console.log("Push response status:", response.status);

    if (!response.ok && response.status !== 410) {
      const text = await response.text();
      console.error("Push response error:", text);
    }

    // 200/201 = success, 410 = subscription expired
    return response.ok || response.status === 410;
  } catch (error) {
    console.error("Error sending web push:", error);
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

    // Send to all subscriptions
    for (const sub of subscriptions) {
      try {
        const subscription = {
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
        };

        const success = await sendWebPush(subscription, payload);
        
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
