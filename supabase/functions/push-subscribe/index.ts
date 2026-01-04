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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    
    // Try to get user from auth header first
    let userId: string | null = null;
    
    if (authHeader) {
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      userId = user?.id || null;
    }
    
    // If no user from header, try to get from body
    const body = await req.json();
    if (!userId && body.userId) {
      userId = body.userId;
    }
    
    if (!userId) {
      throw new Error("Not authenticated - no user found");
    }
    
    // Use service role for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { endpoint, keys, userAgent } = body as SubscribeRequest & { userId?: string };

    console.log("Processing subscription for user:", userId);

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
          owner_id: userId,
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
          owner_id: userId,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          user_agent: userAgent,
          is_active: true,
        });
    }

    console.log("Push subscription saved for user:", userId);

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
