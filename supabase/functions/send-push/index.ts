import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

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

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const vapidEmail = Deno.env.get("VAPID_EMAIL")!;

    // Configure web-push with VAPID keys
    webpush.setVapidDetails(
      `mailto:${vapidEmail}`,
      vapidPublicKey,
      vapidPrivateKey
    );

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
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        console.log("Sending push to endpoint:", sub.endpoint);

        await webpush.sendNotification(
          pushSubscription,
          JSON.stringify(payload),
          {
            TTL: 86400,
          }
        );

        console.log("Push sent successfully");
        successCount++;
      } catch (error: any) {
        console.error("Error sending push to subscription:", error);
        console.error("Error details:", error.body);

        // Mark as inactive if subscription is no longer valid (410 Gone)
        if (error.statusCode === 410) {
          await supabase
            .from("push_subscriptions")
            .update({ is_active: false })
            .eq("id", sub.id);
          console.log("Subscription marked as inactive (410 Gone)");
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
