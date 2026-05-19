import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAID_STATUSES = new Set([
  "paid",
  "pago_antecipado",
  "pago_no_vencimento",
  "pago_com_atraso",
  "debited",
  "arquivado",
  "cancelled",
]);

const getPaymentTotals = async (supabaseClient: ReturnType<typeof createClient>, chargeIds: string[]) => {
  if (chargeIds.length === 0) return new Map<string, number>();

  const { data, error } = await supabaseClient
    .from("charge_payments")
    .select("charge_id, amount_cents")
    .in("charge_id", chargeIds);

  if (error || !data) {
    console.error("Error loading charge payment totals:", error);
    return new Map<string, number>();
  }

  return data.reduce((totals, payment) => {
    totals.set(payment.charge_id, (totals.get(payment.charge_id) ?? 0) + payment.amount_cents);
    return totals;
  }, new Map<string, number>());
};

const isChargeSettled = (
  charge: {
    status?: string | null;
    paid_at?: string | null;
    amount_cents?: number | null;
    management_contribution_cents?: number | null;
  },
  totalPaidCents: number,
) => {
  const amountDueCents = Math.max(
    (charge.amount_cents ?? 0) - (charge.management_contribution_cents ?? 0),
    0,
  );

  return (
    PAID_STATUSES.has(charge.status ?? "") ||
    Boolean(charge.paid_at) ||
    totalPaidCents >= amountDueCents
  );
};

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
    const authHeader = req.headers.get("Authorization");
    
    // Accept either: token query param OR service role key in Authorization header
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const cronToken = Deno.env.get("CRON_SECRET_TOKEN");
    const internalCronToken = "charge_internal_cron_2024"; // Internal token for pg_cron
    
    const isValidToken = token && (token === cronToken || token === internalCronToken);
    const isValidServiceRole = authHeader && authHeader === `Bearer ${serviceRoleKey}`;
    
    if (!isValidToken && !isValidServiceRole) {
      console.log("Unauthorized attempt - token match:", isValidToken, "service role match:", isValidServiceRole);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log("Authorization successful via:", isValidToken ? "token" : "service_role");

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
      reserve_checkin_reminders: 0,
    };

    // Lembretes 48h
    const { data: charges48h } = await supabaseClient
      .from("charges")
      .select("id, title, due_date, status, paid_at, amount_cents, management_contribution_cents")
      .in("status", ["sent", "under_review"])
      .eq("reminder_48h_sent", false)
      .gte("due_date", in48h.toISOString().split("T")[0])
      .lt("due_date", new Date(in48h.getTime() + 86400000).toISOString().split("T")[0]);

    if (charges48h && charges48h.length > 0) {
      const paymentTotals48h = await getPaymentTotals(supabaseClient, charges48h.map((charge) => charge.id));

      for (const charge of charges48h) {
        if (isChargeSettled(charge, paymentTotals48h.get(charge.id) ?? 0)) {
          console.log("Skipping 48h reminder for settled charge:", charge.id);
          continue;
        }

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
      .select("id, title, due_date, status, paid_at, amount_cents, management_contribution_cents")
      .in("status", ["sent", "under_review"])
      .eq("reminder_24h_sent", false)
      .gte("due_date", in24h.toISOString().split("T")[0])
      .lt("due_date", new Date(in24h.getTime() + 86400000).toISOString().split("T")[0]);

    if (charges24h && charges24h.length > 0) {
      const paymentTotals24h = await getPaymentTotals(supabaseClient, charges24h.map((charge) => charge.id));

      for (const charge of charges24h) {
        if (isChargeSettled(charge, paymentTotals24h.get(charge.id) ?? 0)) {
          console.log("Skipping 24h reminder for settled charge:", charge.id);
          continue;
        }

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
      .select("id, title, due_date, status, paid_at, amount_cents, management_contribution_cents")
      .in("status", ["sent", "under_review"])
      .eq("reminder_day_sent", false)
      .eq("due_date", today.toISOString().split("T")[0]);

    if (chargesToday && chargesToday.length > 0) {
      const paymentTotalsToday = await getPaymentTotals(supabaseClient, chargesToday.map((charge) => charge.id));

      for (const charge of chargesToday) {
        if (isChargeSettled(charge, paymentTotalsToday.get(charge.id) ?? 0)) {
          console.log("Skipping same-day reminder for settled charge:", charge.id);
          continue;
        }

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
      .select("id, title, owner_proof_path, status, paid_at, amount_cents, management_contribution_cents")
      .in("status", ["sent", "under_review"])
      .lt("due_date", today.toISOString().split("T")[0]);

    if (overdueCharges && overdueCharges.length > 0) {
      const paymentTotalsOverdue = await getPaymentTotals(supabaseClient, overdueCharges.map((charge) => charge.id));

      for (const charge of overdueCharges) {
        if (isChargeSettled(charge, paymentTotalsOverdue.get(charge.id) ?? 0)) {
          console.log("Skipping overdue transition for settled charge:", charge.id);
          continue;
        }

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
      .select("id, title, status, paid_at, amount_cents, management_contribution_cents")
      .eq("status", "overdue")
      .eq("due_date", oneDayAgo.toISOString().split("T")[0])
      .is("debit_notice_at", null);

    if (debitNoticeCharges && debitNoticeCharges.length > 0) {
      const paymentTotalsDebitNotice = await getPaymentTotals(
        supabaseClient,
        debitNoticeCharges.map((charge) => charge.id),
      );

      for (const charge of debitNoticeCharges) {
        if (isChargeSettled(charge, paymentTotalsDebitNotice.get(charge.id) ?? 0)) {
          console.log("Skipping debit notice for settled charge:", charge.id);
          continue;
        }

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

    // LEMBRETE DÉBITO RESERVA: 1 dia antes do check-in
    // Buscar cobranças em aguardando_reserva com check-in amanhã
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const { data: reserveReminders } = await supabaseClient
      .from("charges")
      .select(`
        id, 
        title, 
        reserve_debit_date,
        reserve_commission_percent,
        reserve_extra_commission_percent,
        property_id,
        owner_id
      `)
      .eq("status", "aguardando_reserva")
      .eq("reserve_debit_date", tomorrowStr);

    if (reserveReminders && reserveReminders.length > 0) {
      // Get admin emails for notification
      const adminEmailsConfig = Deno.env.get("ADMIN_NOTIFY_EMAILS");
      const adminEmails = adminEmailsConfig ? adminEmailsConfig.split(",").map(e => e.trim()) : [];

      // Group by property
      const byProperty: Record<string, typeof reserveReminders> = {};
      for (const charge of reserveReminders) {
        const key = charge.property_id || 'no-property';
        if (!byProperty[key]) byProperty[key] = [];
        byProperty[key].push(charge);
      }

      for (const [propertyId, charges] of Object.entries(byProperty)) {
        let propertyName = "Imóvel";
        if (propertyId !== 'no-property') {
          const { data: property } = await supabaseClient
            .from("properties")
            .select("name")
            .eq("id", propertyId)
            .single();
          if (property) propertyName = property.name;
        }

        const chargeTitles = charges.map(c => c.title).join(", ");
        const commission = charges[0].reserve_commission_percent || 0;
        const extraPercent = charges[0].reserve_extra_commission_percent || 0;

        // Create team notification (including maintenance team)
        const { data: teamMembers } = await supabaseClient
          .from("profiles")
          .select("id")
          .in("role", ["admin", "agent", "maintenance"]);

        if (teamMembers) {
          for (const member of teamMembers) {
            await supabaseClient
              .from("notifications")
              .insert({
                owner_id: member.id,
                title: "⚠️ Check-in Amanhã - Alterar Comissão",
                message: `${propertyName}: Lembrar de alterar comissão para ${commission.toFixed(0)}% (+${extraPercent.toFixed(0)}% extra). Cobranças: ${chargeTitles}`,
                type: "charge",
                reference_url: "/gerenciar-cobrancas",
              });
          }
        }

        // Send email to admins
        if (adminEmails.length > 0) {
          await supabaseClient.functions.invoke("send-charge-email", {
            body: {
              type: "reserve_checkin_reminder",
              chargeId: charges[0].id,
              propertyName,
              chargeTitles,
              commission,
              extraPercent,
              checkinDate: tomorrowStr,
              adminEmails,
            },
          });
        }

        results.reserve_checkin_reminders += charges.length;
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