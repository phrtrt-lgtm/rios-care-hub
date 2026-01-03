import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify cron token
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const cronToken = Deno.env.get("CRON_SECRET_TOKEN");
    
    if (token !== cronToken) {
      console.error("Invalid cron token");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneWeekAgoISO = oneWeekAgo.toISOString();

    console.log(`Auto-archive running at ${now.toISOString()}`);
    console.log(`Archiving items older than ${oneWeekAgoISO}`);

    // Archive tickets that are concluded or cancelled for more than 7 days
    const { data: archivedTickets, error: ticketsError } = await supabase
      .from("tickets")
      .update({ archived_at: now.toISOString() })
      .is("archived_at", null)
      .in("status", ["concluido", "cancelado"])
      .lt("updated_at", oneWeekAgoISO)
      .select("id");

    if (ticketsError) {
      console.error("Error archiving tickets:", ticketsError);
    } else {
      console.log(`Archived ${archivedTickets?.length || 0} tickets`);
    }

    // Archive charges that are paid, debited, or archived for more than 7 days
    const { data: archivedCharges, error: chargesError } = await supabase
      .from("charges")
      .update({ archived_at: now.toISOString() })
      .is("archived_at", null)
      .in("status", ["pago_no_vencimento", "pago_apos_vencimento", "debited", "cancelado"])
      .lt("updated_at", oneWeekAgoISO)
      .select("id");

    if (chargesError) {
      console.error("Error archiving charges:", chargesError);
    } else {
      console.log(`Archived ${archivedCharges?.length || 0} charges`);
    }

    // Archive cleaning inspections older than 7 days
    const { data: archivedInspections, error: inspectionsError } = await supabase
      .from("cleaning_inspections")
      .update({ archived_at: now.toISOString() })
      .is("archived_at", null)
      .lt("created_at", oneWeekAgoISO)
      .select("id");

    if (inspectionsError) {
      console.error("Error archiving inspections:", inspectionsError);
    } else {
      console.log(`Archived ${archivedInspections?.length || 0} inspections`);
    }

    const summary = {
      tickets: archivedTickets?.length || 0,
      charges: archivedCharges?.length || 0,
      inspections: archivedInspections?.length || 0,
      timestamp: now.toISOString(),
    };

    console.log("Auto-archive summary:", summary);

    return new Response(JSON.stringify({ success: true, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in auto-archive:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
