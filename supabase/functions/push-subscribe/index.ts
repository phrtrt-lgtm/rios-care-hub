import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SubscribeRequest {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization")!;
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error("Not authenticated");
    }

    const { endpoint, keys, userAgent }: SubscribeRequest = await req.json();

    console.log("Processing subscription for user:", user.id);

    // Check if subscription already exists
    const { data: existing } = await supabase
      .from("push_subscriptions")
      .select()
      .eq("endpoint", endpoint)
      .maybeSingle();

    if (existing) {
      console.log("Updating existing subscription");
      await supabase
        .from("push_subscriptions")
        .update({ 
          is_active: true, 
          owner_id: user.id,
          p256dh: keys.p256dh,
          auth: keys.auth,
          user_agent: userAgent
        })
        .eq("endpoint", endpoint);
    } else {
      console.log("Creating new subscription");
      await supabase
        .from("push_subscriptions")
        .insert({
          owner_id: user.id,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          user_agent: userAgent,
          is_active: true,
        });
    }

    console.log("Push subscription saved for user:", user.id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in push-subscribe function:", error);
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
