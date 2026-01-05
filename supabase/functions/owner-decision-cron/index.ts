import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    console.log("Running owner decision reminder cron...");

    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Find tickets with owner_action_due_at in the next 24 hours that haven't been decided yet
    const { data: pendingTickets, error } = await supabase
      .from("tickets")
      .select("id, subject, owner_action_due_at")
      .eq("kind", "maintenance")
      .eq("essential", false)
      .is("owner_decision", null)
      .not("owner_action_due_at", "is", null)
      .lte("owner_action_due_at", in24Hours.toISOString())
      .gt("owner_action_due_at", now.toISOString())
      .not("status", "in", "(concluido,cancelado)");

    if (error) {
      console.error("Error fetching pending tickets:", error);
      throw error;
    }

    console.log(`Found ${pendingTickets?.length || 0} tickets needing 24h reminder`);

    // Send reminders
    for (const ticket of pendingTickets || []) {
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/notify-owner-decision`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${anonKey}`,
            "apikey": anonKey,
          },
          body: JSON.stringify({
            type: "decision_reminder",
            ticketId: ticket.id,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Failed to send reminder for ticket ${ticket.id}:`, errorText);
        } else {
          console.log(`Reminder sent for ticket ${ticket.id}`);
        }
      } catch (err) {
        console.error(`Error sending reminder for ticket ${ticket.id}:`, err);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        reminders_sent: pendingTickets?.length || 0 
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in owner-decision-cron:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
