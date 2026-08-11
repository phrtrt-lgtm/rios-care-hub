import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const pad = (n: number) => String(n).padStart(2, "0");

const periodStart = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-01`;

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

const dueDateFor = (year: number, month: number, dueDay: number) => {
  const day = Math.min(dueDay, daysInMonth(year, month));
  return `${year}-${pad(month + 1)}-${pad(day)}`;
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const cronToken = Deno.env.get("CRON_SECRET_TOKEN");
    const internalCronToken = "recurring_internal_cron_2026";
    const isValidToken = Boolean(token) && (token === cronToken || token === internalCronToken);

    let recurringIds: string[] | null = null;
    let force = false;

    // Manual invocation (from the app) requires a signed-in team member
    if (!isValidToken) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const jwt = authHeader.replace("Bearer ", "");
      const { data: userData } = await supabase.auth.getUser(jwt);
      const userId = userData?.user?.id;
      if (!userId) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: isTeam } = await supabase.rpc("is_team_member", { _user_id: userId });
      if (!isTeam) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        const body = await req.json();
        if (Array.isArray(body?.recurringIds)) recurringIds = body.recurringIds;
        force = Boolean(body?.force);
      } catch (_) {
        // no body
      }
    }

    const now = new Date();
    const today = now.getUTCDate();
    const period = periodStart(now);

    let query = supabase
      .from("recurring_charges")
      .select("*")
      .eq("active", true);

    if (recurringIds && recurringIds.length > 0) {
      query = query.in("id", recurringIds);
    }

    const { data: recurrings, error } = await query;
    if (error) throw error;

    const results: Array<Record<string, unknown>> = [];

    for (const rec of recurrings ?? []) {
      // Respect start / end window
      if (rec.start_date && rec.start_date > `${period.slice(0, 7)}-${pad(daysInMonth(now.getUTCFullYear(), now.getUTCMonth()))}`) {
        results.push({ id: rec.id, skipped: "not_started" });
        continue;
      }
      if (rec.end_date && rec.end_date < period) {
        results.push({ id: rec.id, skipped: "ended" });
        continue;
      }
      if (!force && today < rec.due_day) {
        results.push({ id: rec.id, skipped: "before_due_day" });
        continue;
      }

      const { data: existingRun } = await supabase
        .from("recurring_charge_runs")
        .select("id")
        .eq("recurring_charge_id", rec.id)
        .eq("period", period)
        .maybeSingle();

      if (existingRun) {
        results.push({ id: rec.id, skipped: "already_generated" });
        continue;
      }

      const dueDate = dueDateFor(now.getUTCFullYear(), now.getUTCMonth(), rec.due_day);
      const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })
        .format(new Date(`${period}T12:00:00Z`));

      const { data: charge, error: chargeError } = await supabase
        .from("charges")
        .insert({
          owner_id: rec.owner_id,
          property_id: rec.property_id,
          recurring_charge_id: rec.id,
          title: `${rec.title} — ${monthLabel}`,
          description: [rec.description, rec.vendor_name ? `Fornecedor: ${rec.vendor_name}` : null, "Conta recorrente mensal."]
            .filter(Boolean)
            .join("\n\n"),
          category: rec.category,
          amount_cents: rec.amount_cents,
          management_contribution_cents: rec.management_contribution_cents ?? 0,
          due_date: dueDate,
          status: "sent",
          sent_at: now.toISOString(),
        })
        .select("id")
        .single();

      if (chargeError) {
        console.error("Failed to create recurring charge:", rec.id, chargeError);
        results.push({ id: rec.id, error: chargeError.message });
        continue;
      }

      await supabase.from("recurring_charge_runs").insert({
        recurring_charge_id: rec.id,
        period,
        charge_id: charge.id,
      });

      await supabase
        .from("recurring_charges")
        .update({ last_generated_period: period })
        .eq("id", rec.id);

      await supabase.from("notifications").insert({
        owner_id: rec.owner_id,
        type: "charge_created",
        title: "Nova cobrança recorrente",
        message: `${rec.title} — vencimento em ${new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${dueDate}T12:00:00Z`))}`,
        reference_url: `/cobranca/${charge.id}`,
        reference_id: charge.id,
        entity_type: "charge",
        entity_id: charge.id,
      });

      try {
        await supabase.functions.invoke("send-charge-email", {
          body: { type: "charge_created", chargeId: charge.id },
        });
      } catch (mailError) {
        console.error("Email notification failed for charge", charge.id, mailError);
      }

      results.push({ id: rec.id, charge_id: charge.id, due_date: dueDate, created: true });
    }

    return new Response(JSON.stringify({ period, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("recurring-charges-cron error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
