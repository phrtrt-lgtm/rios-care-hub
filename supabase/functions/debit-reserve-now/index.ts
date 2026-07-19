import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReservationItem {
  date: string;              // YYYY-MM-DD
  owner_value_cents: number; // valor bruto do proprietário nessa reserva
  retained_cents: number;    // quanto foi retido dessa reserva
}

interface DebitReserveNowRequest {
  chargeIds: string[];
  reservations: ReservationItem[];
  baseCommissionPercent?: number;
  extraCommissionPercent?: number;
  totalCommissionPercent?: number;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: DebitReserveNowRequest = await req.json();
    const {
      chargeIds,
      reservations,
      baseCommissionPercent = 0,
      extraCommissionPercent = 0,
      totalCommissionPercent = 0,
    } = body;

    if (!chargeIds?.length || !reservations?.length) {
      return new Response(
        JSON.stringify({ error: 'chargeIds and reservations are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Auth: extract acting user for audit trail
    let actorId: string | null = null;
    try {
      const authHeader = req.headers.get('Authorization') ?? '';
      const token = authHeader.replace('Bearer ', '');
      if (token) {
        const { data } = await supabase.auth.getUser(token);
        actorId = data.user?.id ?? null;
      }
    } catch (_) { /* ignore */ }

    // Load charges
    const { data: charges, error: chargesError } = await supabase
      .from('charges')
      .select('id, owner_id, debited_at, status, title, amount_cents, management_contribution_cents, property_id')
      .in('id', chargeIds);

    if (chargesError || !charges?.length) {
      return new Response(
        JSON.stringify({ error: 'Charges not found', details: chargesError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const chargesToProcess = charges.filter(c => !c.debited_at);
    if (!chargesToProcess.length) {
      return new Response(
        JSON.stringify({ message: 'All charges already debited' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ownerId = chargesToProcess[0].owner_id;

    const totalRetainedCents = reservations.reduce((s, r) => s + Math.max(0, r.retained_cents ?? 0), 0);
    const totalOwnerValueCents = reservations.reduce((s, r) => s + Math.max(0, r.owner_value_cents ?? 0), 0);

    // Compute per-charge amount due (net of management contribution) and remaining to pay
    const chargeDues = chargesToProcess.map(c => {
      const contribution = (c as any).management_contribution_cents ?? 0;
      const due = Math.max(0, c.amount_cents - contribution);
      return { charge: c, due };
    });
    const totalDueCents = chargeDues.reduce((s, x) => s + x.due, 0);

    const debitedAt = new Date().toISOString();
    const primaryDate = reservations[0].date;

    // Distribute retained amount in order across charges
    let remainingToApply = totalRetainedCents;
    const reservationsJson = reservations.map(r => ({
      date: r.date,
      owner_value_cents: r.owner_value_cents ?? 0,
      coverage_cents: r.retained_cents ?? 0,
      owner_receives_cents: Math.max(0, (r.owner_value_cents ?? 0) - (r.retained_cents ?? 0)),
    }));

    // Update every charge as debited (regardless of full coverage; whole set was retained retroactively)
    for (const { charge, due } of chargeDues) {
      const applied = Math.min(remainingToApply, due);
      remainingToApply -= applied;

      const { error: updErr } = await supabase
        .from('charges')
        .update({
          status: 'debited',
          debited_at: debitedAt,
          paid_at: debitedAt,
          retroactive_debit: true,
          reserve_debit_date: primaryDate,
          reserve_commission_percent: totalCommissionPercent || null,
          reserve_base_commission_percent: baseCommissionPercent || null,
          reserve_extra_commission_percent: extraCommissionPercent || null,
          reserve_owner_value_cents: totalOwnerValueCents,
          reserve_owner_receives_cents: Math.max(0, totalOwnerValueCents - totalRetainedCents),
          reserve_reservations: reservationsJson,
          updated_at: debitedAt,
        })
        .eq('id', charge.id);

      if (updErr) console.error('Failed to update charge', charge.id, updErr);
    }

    // Score history (-30 per charge, matching existing flow)
    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('id, name, email, payment_score')
      .eq('id', ownerId)
      .single();

    let currentScore = ownerProfile?.payment_score ?? 50;
    for (const { charge } of chargeDues) {
      const { data: existing } = await supabase
        .from('owner_payment_scores')
        .select('id')
        .eq('charge_id', charge.id)
        .maybeSingle();
      if (existing) continue;
      const newScore = Math.max(0, Math.min(100, currentScore - 30));
      await supabase.from('owner_payment_scores').insert({
        owner_id: ownerId,
        charge_id: charge.id,
        score_before: currentScore,
        score_after: newScore,
        points_change: -30,
        reason: 'reserve_debit',
      });
      currentScore = newScore;
    }
    if (ownerProfile) {
      await supabase.from('profiles').update({ payment_score: currentScore }).eq('id', ownerId);
    }

    // Surplus → owner_credits
    const surplusCents = Math.max(0, totalRetainedCents - totalDueCents);
    let creditId: string | null = null;
    if (surplusCents > 0) {
      const noteDates = reservations.map(r => {
        const d = new Date(r.date + 'T00:00:00');
        return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      }).join(', ');
      const { data: credit } = await supabase
        .from('owner_credits')
        .insert({
          owner_id: ownerId,
          origin_type: 'reserve_retention',
          origin_note: `Excedente de retenção em reserva(s): ${noteDates}`,
          origin_reservations: reservationsJson,
          initial_amount_cents: surplusCents,
          remaining_amount_cents: surplusCents,
          status: 'open',
          created_by: actorId,
        })
        .select('id')
        .single();
      creditId = credit?.id ?? null;
    }

    // Property name for email
    let propertyName = 'Imóvel';
    const chargeWithProp = chargesToProcess.find(c => c.property_id);
    if (chargeWithProp?.property_id) {
      const { data: property } = await supabase
        .from('properties')
        .select('name')
        .eq('id', chargeWithProp.property_id)
        .single();
      if (property) propertyName = property.name;
    }

    const formatBRL = (cents: number) =>
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

    const formatDate = (iso: string) => {
      const d = new Date(iso + 'T00:00:00');
      return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    };

    // Reservations table (same visual style as debit-reserve)
    const reservationsTableHtml = `
      <div style="margin:24px 0;padding:16px;background:#f8f9fa;border-radius:8px;border:1px solid #e5e7eb">
        <h3 style="margin:0 0 12px;color:#1a1a1a;font-size:15px">Reservas utilizadas (${reservations.length})</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#eef2ff;color:#1a1a1a">
              <th style="padding:8px;text-align:left;border-bottom:1px solid #d1d5db">Check-in</th>
              <th style="padding:8px;text-align:right;border-bottom:1px solid #d1d5db">Valor original</th>
              <th style="padding:8px;text-align:right;border-bottom:1px solid #d1d5db">Retido</th>
              <th style="padding:8px;text-align:right;border-bottom:1px solid #d1d5db">Você recebeu</th>
            </tr>
          </thead>
          <tbody>
            ${reservationsJson.map(r => `
              <tr>
                <td style="padding:8px;border-bottom:1px solid #f1f5f9">${formatDate(r.date)}</td>
                <td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9">${formatBRL(r.owner_value_cents)}</td>
                <td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9;color:#b91c1c">- ${formatBRL(r.coverage_cents)}</td>
                <td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9"><strong>${formatBRL(r.owner_receives_cents)}</strong></td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:600;background:#f1f5f9">
              <td style="padding:8px">Total</td>
              <td style="padding:8px;text-align:right">${formatBRL(totalOwnerValueCents)}</td>
              <td style="padding:8px;text-align:right;color:#b91c1c">- ${formatBRL(totalRetainedCents)}</td>
              <td style="padding:8px;text-align:right">${formatBRL(Math.max(0, totalOwnerValueCents - totalRetainedCents))}</td>
            </tr>
          </tfoot>
        </table>
      </div>`;

    const chargeTitles = chargesToProcess.map(c => c.title).join(', ');
    const nowFmt = new Date().toLocaleDateString('pt-BR');

    const surplusBlockHtml = surplusCents > 0 ? `
      <div style="margin:16px 0;padding:14px;background:#ecfdf5;border-left:4px solid #10b981;border-radius:4px">
        <p style="margin:0 0 6px;color:#065f46;font-weight:600">Saldo credor gerado: ${formatBRL(surplusCents)}</p>
        <p style="margin:0;color:#065f46;font-size:13px">
          A retenção foi maior que o valor devido. Esse saldo ficará disponível para abater cobranças futuras ou ser devolvido.
        </p>
      </div>` : '';

    const retroBanner = `
      <div style="margin:16px 0;padding:14px;background:#eff6ff;border-left:4px solid #3b82f6;border-radius:4px">
        <p style="margin:0;color:#1e3a8a;font-size:14px">
          <strong>Débito já efetuado em ${nowFmt}.</strong> Nenhuma ação é necessária da sua parte.
          As cobranças abaixo já estão quitadas via retenção em reserva.
        </p>
      </div>`;

    // In-app notification
    await supabase.from('notifications').insert({
      owner_id: ownerId,
      title: 'Débito em Reserva Efetuado',
      message: `${chargesToProcess.length} cobrança(s) quitada(s) via retenção em ${reservations.length} reserva(s).${surplusCents > 0 ? ` Saldo credor de ${formatBRL(surplusCents)}.` : ''}`,
      type: 'charge',
      reference_id: chargesToProcess[0].id,
      reference_url: `/minhas-cobrancas`,
    });

    // Email
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const mailFrom = Deno.env.get('MAIL_FROM') || 'onboarding@resend.dev';
    if (resendApiKey && ownerProfile?.email) {
      try {
        const { data: template } = await supabase
          .from('email_templates')
          .select('subject, body_html')
          .eq('key', 'reserve_debit_retroactive')
          .single();

        if (template) {
          const subject = template.subject
            .replace(/\{\{property_name\}\}/g, propertyName)
            .replace(/\{\{owner_name\}\}/g, ownerProfile.name);

          const bodyHtml = template.body_html
            .replace(/\{\{owner_name\}\}/g, ownerProfile.name)
            .replace(/\{\{property_name\}\}/g, propertyName)
            .replace(/\{\{charge_title\}\}/g, chargeTitles)
            .replace(/\{\{debt_amount\}\}/g, formatBRL(totalRetainedCents))
            .replace(/\{\{debit_date\}\}/g, nowFmt)
            .replace(/\{\{portal_url\}\}/g, '/minhas-cobrancas')
            .replace(/\{\{reservations_table\}\}/g, reservationsTableHtml)
            .replace(/\{\{surplus_block\}\}/g, surplusBlockHtml);

          const resend = new Resend(resendApiKey);
          await resend.emails.send({
            from: mailFrom,
            to: [ownerProfile.email],
            subject,
            html: bodyHtml,
          });
        }
      } catch (emailError) {
        console.error('Email error:', emailError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processedCount: chargesToProcess.length,
        surplusCents,
        creditId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('debit-reserve-now error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
