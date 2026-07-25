import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReservationItem {
  date: string;              // YYYY-MM-DD
  owner_value_cents: number;
  retained_cents: number;
}

interface DebitReserveNowRequest {
  chargeIds: string[];       // used to derive owner + context (charges are NOT closed automatically)
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
    const { chargeIds, reservations } = body;

    if (!chargeIds?.length || !reservations?.length) {
      return new Response(
        JSON.stringify({ error: 'chargeIds and reservations are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let actorId: string | null = null;
    try {
      const authHeader = req.headers.get('Authorization') ?? '';
      const token = authHeader.replace('Bearer ', '');
      if (token) {
        const { data } = await supabase.auth.getUser(token);
        actorId = data.user?.id ?? null;
      }
    } catch (_) { /* ignore */ }

    // Load context charges (used to identify owner + property; NOT necessarily consumed)
    const { data: charges, error: chargesError } = await supabase
      .from('charges')
      .select('id, owner_id, title, property_id, amount_cents, management_contribution_cents')
      .in('id', chargeIds);

    if (chargesError || !charges?.length) {
      return new Response(
        JSON.stringify({ error: 'Charges not found', details: chargesError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ownerId = charges[0].owner_id;

    const totalRetainedCents = reservations.reduce((s, r) => s + Math.max(0, r.retained_cents ?? 0), 0);
    const totalOwnerValueCents = reservations.reduce((s, r) => s + Math.max(0, r.owner_value_cents ?? 0), 0);

    const reservationsJson = reservations.map(r => ({
      date: r.date,
      owner_value_cents: r.owner_value_cents ?? 0,
      coverage_cents: r.retained_cents ?? 0,
      owner_receives_cents: Math.max(0, (r.owner_value_cents ?? 0) - (r.retained_cents ?? 0)),
    }));

    // ---- 1) Create owner_credit (initial = total retained) -------------------
    const noteDates = reservations.map(r => {
      const d = new Date(r.date + 'T00:00:00');
      return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    }).join(', ');

    const { data: credit, error: creditError } = await supabase
      .from('owner_credits')
      .insert({
        owner_id: ownerId,
        origin_type: 'reserve_retention',
        origin_note: `Retenção em reserva(s): ${noteDates}`,
        origin_reservations: reservationsJson,
        initial_amount_cents: totalRetainedCents,
        remaining_amount_cents: totalRetainedCents,
        status: 'open',
        created_by: actorId,
      })
      .select('id')
      .single();

    if (creditError || !credit) {
      console.error('Failed to create owner_credit', creditError);
      return new Response(
        JSON.stringify({ error: 'Failed to create credit', details: creditError?.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---- 2) Apply credit to all owner's open charges (oldest first) ----------
    // Fetch every open charge from this owner (não só os do dialog) — descontar em ordem crescente de vencimento.
    const { data: openCharges } = await supabase
      .from('charges')
      .select('id, amount_cents, management_contribution_cents, credit_applied_cents, due_date, status, paid_at')
      .eq('owner_id', ownerId)
      .is('archived_at', null)
      .is('paid_at', null)
      .not('status', 'in', '(draft,paid,pago_no_vencimento,pago_antecipado,pago_com_atraso,debited,cancelled,arquivado)')
      .order('due_date', { ascending: true, nullsFirst: false });

    let remaining = totalRetainedCents;
    const applications: { chargeId: string; applied: number; nowPaid: boolean }[] = [];

    for (const c of (openCharges ?? [])) {
      if (remaining <= 0) break;
      const contrib = c.management_contribution_cents ?? 0;
      const alreadyCredited = c.credit_applied_cents ?? 0;
      const outstanding = Math.max(0, c.amount_cents - contrib - alreadyCredited);
      if (outstanding <= 0) continue;

      const applyNow = Math.min(remaining, outstanding);
      const newCredited = alreadyCredited + applyNow;
      const nowFullyPaid = newCredited >= (c.amount_cents - contrib);

      const updatePayload: Record<string, unknown> = {
        credit_applied_cents: newCredited,
        updated_at: new Date().toISOString(),
      };
      if (nowFullyPaid) {
        // Trigger auto_set_paid_status_on_paid_at will set the correct status.
        updatePayload.paid_at = new Date().toISOString();
      }

      const { error: updErr } = await supabase
        .from('charges')
        .update(updatePayload)
        .eq('id', c.id);

      if (updErr) {
        console.error('Failed to apply credit to charge', c.id, updErr);
        continue;
      }

      await supabase.from('owner_credit_applications').insert({
        credit_id: credit.id,
        charge_id: c.id,
        amount_applied_cents: applyNow,
        applied_by: actorId,
      });

      remaining -= applyNow;
      applications.push({ chargeId: c.id, applied: applyNow, nowPaid: nowFullyPaid });
    }

    // Update credit remaining balance (sobra fica como saldo credor positivo)
    if (remaining !== totalRetainedCents) {
      await supabase
        .from('owner_credits')
        .update({
          remaining_amount_cents: remaining,
          status: remaining <= 0 ? 'consumed' : 'open',
        })
        .eq('id', credit.id);
    }

    const totalAppliedCents = totalRetainedCents - remaining;
    const surplusCents = remaining;

    // ---- 3) Notify owner (in-app + email) ------------------------------------
    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('id', ownerId)
      .single();

    let propertyName = 'Imóvel';
    const chargeWithProp = charges.find(c => c.property_id);
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

    const surplusBlockHtml = surplusCents > 0
      ? `
      <div style="margin:16px 0;padding:14px;background:#ecfdf5;border-left:4px solid #10b981;border-radius:4px">
        <p style="margin:0 0 6px;color:#065f46;font-weight:600">Saldo credor disponível: ${formatBRL(surplusCents)}</p>
        <p style="margin:0;color:#065f46;font-size:13px">
          A retenção cobriu todas as cobranças em aberto e sobrou saldo, que ficará disponível para abater cobranças futuras.
        </p>
      </div>`
      : `
      <div style="margin:16px 0;padding:14px;background:#eff6ff;border-left:4px solid #3b82f6;border-radius:4px">
        <p style="margin:0;color:#1e3a8a;font-size:13px">
          Foram aplicados ${formatBRL(totalAppliedCents)} nas cobranças em aberto. As cobranças continuam visíveis no seu portal com o valor devido atualizado.
        </p>
      </div>`;

    // In-app notification
    await supabase.from('notifications').insert({
      owner_id: ownerId,
      title: 'Retenção em Reserva Aplicada',
      message: `Retenção de ${formatBRL(totalRetainedCents)} aplicada nas suas cobranças em aberto. ${surplusCents > 0 ? `Sobra de ${formatBRL(surplusCents)} como saldo credor.` : ''}`.trim(),
      type: 'charge',
      reference_id: charges[0].id,
      reference_url: `/minhas-cobrancas`,
    });

    // Email (template reserve_debit_retroactive)
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
          const nowFmt = new Date().toLocaleDateString('pt-BR');
          const chargeTitles = charges.map(c => c.title).join(', ');
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
        creditId: credit.id,
        totalRetainedCents,
        totalAppliedCents,
        surplusCents,
        chargesAffected: applications.length,
        chargesFullyPaid: applications.filter(a => a.nowPaid).length,
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
