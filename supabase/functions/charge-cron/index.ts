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
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (token !== Deno.env.get("CRON_SECRET_TOKEN")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const in48h = new Date(today);
    in48h.setDate(in48h.getDate() + 2);

    const in24h = new Date(today);
    in24h.setDate(in24h.getDate() + 1);

    const results = {
      reminders_48h: 0,
      reminders_24h: 0,
      reminders_today: 0,
      overdue: 0,
      debit_notices: 0,
    };

    // Lembretes 48h
    const { data: charges48h } = await supabaseClient
      .from("charges")
      .select("id, title, due_date")
      .in("status", ["sent", "under_review"])
      .eq("reminder_48h_sent", false)
      .gte("due_date", in48h.toISOString().split("T")[0])
      .lt("due_date", new Date(in48h.getTime() + 86400000).toISOString().split("T")[0]);

    if (charges48h && charges48h.length > 0) {
      for (const charge of charges48h) {
        await supabaseClient.functions.invoke("send-charge-email", {
          body: {
            type: "charge_reminder",
            chargeId: charge.id,
            diasRestantes: "2",
          },
        });

        await supabaseClient
          .from("charges")
          .update({ reminder_48h_sent: true })
          .eq("id", charge.id);

        results.reminders_48h++;
      }
    }

    // Lembretes 24h
    const { data: charges24h } = await supabaseClient
      .from("charges")
      .select("id, title, due_date")
      .in("status", ["sent", "under_review"])
      .eq("reminder_24h_sent", false)
      .gte("due_date", in24h.toISOString().split("T")[0])
      .lt("due_date", new Date(in24h.getTime() + 86400000).toISOString().split("T")[0]);

    if (charges24h && charges24h.length > 0) {
      for (const charge of charges24h) {
        await supabaseClient.functions.invoke("send-charge-email", {
          body: {
            type: "charge_reminder",
            chargeId: charge.id,
            diasRestantes: "1",
          },
        });

        await supabaseClient
          .from("charges")
          .update({ reminder_24h_sent: true })
          .eq("id", charge.id);

        results.reminders_24h++;
      }
    }

    // Lembretes do dia
    const { data: chargesToday } = await supabaseClient
      .from("charges")
      .select("id, title, due_date")
      .in("status", ["sent", "under_review"])
      .eq("reminder_day_sent", false)
      .eq("due_date", today.toISOString().split("T")[0]);

    if (chargesToday && chargesToday.length > 0) {
      for (const charge of chargesToday) {
        await supabaseClient.functions.invoke("send-charge-email", {
          body: {
            type: "charge_reminder",
            chargeId: charge.id,
            diasRestantes: "hoje",
          },
        });

        await supabaseClient
          .from("charges")
          .update({ reminder_day_sent: true })
          .eq("id", charge.id);

        results.reminders_today++;
      }
    }

    // Cobranças vencidas
    const { data: overdueCharges } = await supabaseClient
      .from("charges")
      .select("id, title, owner_proof_path")
      .in("status", ["sent", "under_review"])
      .lt("due_date", today.toISOString().split("T")[0]);

    if (overdueCharges && overdueCharges.length > 0) {
      for (const charge of overdueCharges) {
        if (!charge.owner_proof_path) {
          await supabaseClient
            .from("charges")
            .update({ status: "overdue" })
            .eq("id", charge.id);

          await supabaseClient.functions.invoke("send-charge-email", {
            body: {
              type: "charge_overdue",
              chargeId: charge.id,
            },
          });

          results.overdue++;
        }
      }
    }

    // Avisos de débito (+1 dia de vencida)
    const oneDayAgo = new Date(today);
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const { data: debitNoticeCharges } = await supabaseClient
      .from("charges")
      .select("id, title")
      .eq("status", "overdue")
      .eq("due_date", oneDayAgo.toISOString().split("T")[0])
      .is("debit_notice_at", null);

    if (debitNoticeCharges && debitNoticeCharges.length > 0) {
      for (const charge of debitNoticeCharges) {
        await supabaseClient
          .from("charges")
          .update({
            status: "debit_notice_sent",
            debit_notice_at: new Date().toISOString(),
          })
          .eq("id", charge.id);

        await supabaseClient.functions.invoke("send-charge-email", {
          body: {
            type: "charge_debit_notice",
            chargeId: charge.id,
          },
        });

        results.debit_notices++;
      }
    }

    console.log("Cron execution results:", results);

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in charge-cron:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);