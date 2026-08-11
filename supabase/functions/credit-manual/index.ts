import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ManualCreditRequest {
  chargeIds?: string[];   // used to derive owner + property context
  ownerId?: string;       // alternative when no charge context
  amountCents: number;
  description: string;    // explicação do que aconteceu
  reason?: string;        // rótulo curto (ex.: "Compensação por danos")
  occurredAt?: string;    // YYYY-MM-DD
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body: ManualCreditRequest = await req.json();
    const { chargeIds, amountCents, description, reason, occurredAt } = body;

    if (!amountCents || amountCents <= 0 || !description?.trim()) {
      return new Response(
        JSON.stringify({ error: 'amountCents (>0) and description are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let actorId: string | null = null;
    try {
      const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
      if (token) {
        const { data } = await supabase.auth.getUser(token);
        actorId = data.user?.id ?? null;
      }
    } catch (_) { /* ignore */ }

    // Derive owner from context charges (or explicit ownerId)
    let ownerId = body.ownerId ?? null;
    let contextCharges: any[] = [];
    if (chargeIds?.length) {
      const { data: charges } = await supabase
        .from('charges')
        .select('id, owner_id, title, property_id')
        .in('id', chargeIds);
      contextCharges = charges ?? [];
      ownerId = ownerId ?? contextCharges[0]?.owner_id ?? null;
    }

    if (!ownerId) {
      return new Response(
        JSON.stringify({ error: 'Owner could not be determined' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const eventDate = occurredAt || new Date().toISOString().slice(0, 10);
    const label = reason?.trim() || 'Crédito manual';

    // ---- 1) Create the credit ------------------------------------------------
    const { data: credit, error: creditError } = await supabase
      .from('owner_credits')
      .insert({
        owner_id: ownerId,
        origin_type: 'manual_adjustment',
        origin_note: label,
        origin_reservations: [
          { date: eventDate, kind: 'manual', description: description.trim(), amount_cents: amountCents },
        ],
        initial_amount_cents: amountCents,
        remaining_amount_cents: amountCents,
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

    // ---- 2) Apply against open charges (oldest due date first) ---------------
    const { data: openCharges } = await supabase
      .from('charges')
      .select('id, amount_cents, management_contribution_cents, credit_applied_cents, due_date, status, paid_at')
      .eq('owner_id', ownerId)
      .is('archived_at', null)
      .is('paid_at', null)
      .not('status', 'in', '(draft,paid,pago_no_vencimento,pago_antecipado,pago_com_atraso,debited,cancelled,arquivado)')
      .order('due_date', { ascending: true, nullsFirst: false });

    let remaining = amountCents;
    let chargesAffected = 0;
    let chargesFullyPaid = 0;

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
      if (nowFullyPaid) updatePayload.paid_at = new Date().toISOString();

      const { error: updErr } = await supabase.from('charges').update(updatePayload).eq('id', c.id);
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
      chargesAffected += 1;
      if (nowFullyPaid) chargesFullyPaid += 1;
    }

    if (remaining !== amountCents) {
      await supabase
        .from('owner_credits')
        .update({ remaining_amount_cents: remaining, status: remaining <= 0 ? 'consumed' : 'open' })
        .eq('id', credit.id);
    }

    const totalAppliedCents = amountCents - remaining;
    const surplusCents = remaining;

    // ---- 3) Notify owner -----------------------------------------------------
    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('id', ownerId)
      .single();

    let propertyName = 'Imóvel';
    const chargeWithProp = contextCharges.find((c) => c.property_id);
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
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    };

    const detailsBlockHtml = `
      <div style="margin:24px 0;padding:16px;background:#f8f9fa;border-radius:8px;border:1px solid #e5e7eb">
        <h3 style="margin:0 0 12px;color:#1a1a1a;font-size:15px">Detalhes do crédito registrado</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tbody>
            <tr>
              <td style="padding:8px;border-bottom:1px solid #f1f5f9;color:#475569">Motivo</td>
              <td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9"><strong>${label}</strong></td>
            </tr>
            <tr>
              <td style="padding:8px;border-bottom:1px solid #f1f5f9;color:#475569">Data</td>
              <td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9">${formatDate(eventDate)}</td>
            </tr>
            <tr>
              <td style="padding:8px;color:#475569">Valor</td>
              <td style="padding:8px;text-align:right"><strong>${formatBRL(amountCents)}</strong></td>
            </tr>
          </tbody>
        </table>
        <p style="margin:12px 0 0;color:#1a1a1a;font-size:13px;white-space:pre-wrap">${description.trim().replace(/</g, '&lt;')}</p>
      </div>`;

    const surplusBlockHtml = surplusCents > 0
      ? `
      <div style="margin:16px 0;padding:14px;background:#ecfdf5;border-left:4px solid #10b981;border-radius:4px">
        <p style="margin:0 0 6px;color:#065f46;font-weight:600">Saldo credor disponível: ${formatBRL(surplusCents)}</p>
        <p style="margin:0;color:#065f46;font-size:13px">
          O valor cobriu as cobranças em aberto e sobrou saldo, que ficará disponível para abater cobranças futuras.
        </p>
      </div>`
      : `
      <div style="margin:16px 0;padding:14px;background:#eff6ff;border-left:4px solid #3b82f6;border-radius:4px">
        <p style="margin:0;color:#1e3a8a;font-size:13px">
          Foram aplicados ${formatBRL(totalAppliedCents)} nas cobranças em aberto. As cobranças continuam visíveis no seu portal com o valor devido atualizado.
        </p>
      </div>`;

    await supabase.from('notifications').insert({
      owner_id: ownerId,
      title: 'Crédito registrado nas suas cobranças',
      message: `${label}: ${formatBRL(amountCents)} registrado e aplicado nas cobranças em aberto.${surplusCents > 0 ? ` Sobra de ${formatBRL(surplusCents)} como saldo credor.` : ''}`,
      type: 'charge',
      reference_id: contextCharges[0]?.id ?? null,
      reference_url: `/minhas-cobrancas`,
    });

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
            .replace(/\{\{charge_title\}\}/g, label)
            .replace(/\{\{debt_amount\}\}/g, formatBRL(amountCents))
            .replace(/\{\{debit_date\}\}/g, formatDate(eventDate))
            .replace(/\{\{portal_url\}\}/g, '/minhas-cobrancas')
            .replace(/\{\{reservations_table\}\}/g, detailsBlockHtml)
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
        amountCents,
        totalAppliedCents,
        surplusCents,
        chargesAffected,
        chargesFullyPaid,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('credit-manual error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
