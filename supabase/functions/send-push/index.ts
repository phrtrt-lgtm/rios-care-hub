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

async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload
): Promise<boolean> {
  try {
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const vapidEmail = Deno.env.get("VAPID_EMAIL")!;

    console.log("Sending push to endpoint:", subscription.endpoint);

    // Send push notification using web-push protocol
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        TTL: "86400",
      },
      body: JSON.stringify(payload),
    });

    console.log("Push response status:", response.status);
    
    // 201 = Created, 200 = OK, 410 = Gone (subscription expired)
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
          // Mark as inactive if push failed with 410 (Gone)
          await supabase
            .from("push_subscriptions")
            .update({ is_active: false })
            .eq("id", sub.id);
        }
      } catch (error: any) {
        console.error("Error sending push to subscription:", error);
        
        // Mark as inactive if subscription is no longer valid
        if (error.status === 410) {
          await supabase
            .from("push_subscriptions")
            .update({ is_active: false })
            .eq("id", sub.id);
        }
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
