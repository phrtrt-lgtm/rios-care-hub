import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALERT_EMAIL = "phrtrt@gmail.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find charges where reserve_debit_date is 2+ days in the past and alert not yet sent
    const today = new Date();
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - 2);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const { data: charges, error } = await supabase
      .from("charges")
      .select("id, title, owner_id, property_id, reserve_debit_date, reserve_commission_percent, reserve_base_commission_percent, reserve_extra_commission_percent, reserve_revert_alert_sent_at")
      .eq("status", "aguardando_reserva")
      .not("reserve_debit_date", "is", null)
      .lte("reserve_debit_date", cutoffStr)
      .is("reserve_revert_alert_sent_at", null);

    if (error) throw error;

    if (!charges || charges.length === 0) {
      return new Response(JSON.stringify({ message: "No reverts pending", count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by property + checkin date to avoid duplicate emails for the same reservation
    const groups = new Map<string, typeof charges>();
    for (const c of charges) {
      const key = `${c.property_id ?? "none"}|${c.reserve_debit_date}`;
      if (!groups.has(key)) groups.set(key, [] as any);
      groups.get(key)!.push(c);
    }

    // Fetch property names + owner names
    const propertyIds = [...new Set(charges.map(c => c.property_id).filter(Boolean))] as string[];
    const ownerIds = [...new Set(charges.map(c => c.owner_id).filter(Boolean))] as string[];

    const [{ data: properties }, { data: owners }] = await Promise.all([
      supabase.from("properties").select("id, name").in("id", propertyIds.length ? propertyIds : ["00000000-0000-0000-0000-000000000000"]),
      supabase.from("profiles").select("id, name").in("id", ownerIds.length ? ownerIds : ["00000000-0000-0000-0000-000000000000"]),
    ]);

    const propMap = new Map((properties ?? []).map(p => [p.id, p.name]));
    const ownerMap = new Map((owners ?? []).map(o => [o.id, o.name]));

    const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR");

    const rowsHtml = [...groups.values()].map(group => {
      const first = group[0];
      const propName = propMap.get(first.property_id!) ?? "—";
      const ownerName = ownerMap.get(first.owner_id!) ?? "—";
      return `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">${propName}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">${ownerName}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">${fmtDate(first.reserve_debit_date!)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center"><strong>${first.reserve_commission_percent ?? "—"}%</strong></td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center">${first.reserve_base_commission_percent ?? "—"}%</td>
        </tr>
      `;
    }).join("");

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;color:#1a1a1a">
        <h2 style="color:#b45309;margin:0 0 8px">⚠️ Reverter comissão de débito em reserva</h2>
        <p>Passaram-se 2+ dias desde o check-in das reservas abaixo. <strong>Reverter a comissão ao valor normal no canal (Airbnb/Booking/Hostex).</strong></p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px;border:1px solid #e5e7eb">
          <thead>
            <tr style="background:#fef3c7">
              <th style="padding:8px;text-align:left">Imóvel</th>
              <th style="padding:8px;text-align:left">Proprietário</th>
              <th style="padding:8px;text-align:left">Check-in</th>
              <th style="padding:8px;text-align:center">Comissão atual</th>
              <th style="padding:8px;text-align:center">Voltar para</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <p style="margin-top:16px;font-size:12px;color:#6b7280">Total: ${groups.size} reserva(s) / ${charges.length} cobrança(s).</p>
      </div>
    `;

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    const { error: emailErr } = await resend.emails.send({
      from: "RIOS <sistema@rioshospedagens.com.br>",
      reply_to: "rioslagoon@gmail.com",
      to: [ALERT_EMAIL],
      subject: `⚠️ Reverter comissão – ${groups.size} reserva(s) com débito vencido`,
      html,
    });
    if (emailErr) throw emailErr;

    // Mark all as alerted
    const ids = charges.map(c => c.id);
    await supabase
      .from("charges")
      .update({ reserve_revert_alert_sent_at: new Date().toISOString() })
      .in("id", ids);

    return new Response(JSON.stringify({ success: true, alerted: ids.length, groups: groups.size }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("reserve-debit-revert-alert error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
