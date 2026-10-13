import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { exigirPapel } from "../_shared/auth-guard.ts";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Reenvia o e-mail de aviso de uma retenção em reserva já registrada,
// sem criar nem alterar nenhum dado financeiro.
const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { autor, resposta } = await exigirPapel(
      req,
      ["admin", "agent", "maintenance"],
      corsHeaders,
    );
    if (resposta) return resposta;
    console.log("[resend-debit-email] autorizado por:", autor!.id, autor!.role);

    const { creditId } = await req.json();
    if (!creditId) {
      return new Response(
        JSON.stringify({ error: 'creditId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: credit, error: creditError } = await supabase
      .from('owner_credits')
      .select('id, owner_id, origin_type, origin_note, origin_reservations, initial_amount_cents, remaining_amount_cents, created_at')
      .eq('id', creditId)
      .single();

    if (creditError || !credit) {
      return new Response(
        JSON.stringify({ error: 'Credit not found', details: creditError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('id', credit.owner_id)
      .single();

    if (!ownerProfile?.email) {
      return new Response(
        JSON.stringify({ error: 'Owner has no email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Cobranças que receberam aplicação deste crédito
    const { data: applications } = await supabase
      .from('owner_credit_applications')
      .select('charge_id, amount_applied_cents, charges(title, property_id)')
      .eq('credit_id', creditId);

    const chargeTitles = (applications ?? [])
      .map((a: any) => a.charges?.title)
      .filter(Boolean)
      .join(', ') || credit.origin_note || 'Cobranças em aberto';

    let propertyName = 'Imóvel';
    const propId = (applications ?? []).find((a: any) => a.charges?.property_id)?.charges?.property_id;
    if (propId) {
      const { data: property } = await supabase
        .from('properties')
        .select('name')
        .eq('id', propId)
        .single();
      if (property) propertyName = property.name;
    }

    const formatBRL = (cents: number) =>
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

    const formatDate = (iso: string) => {
      const d = new Date(iso + 'T00:00:00');
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    };

    const reservations: any[] = Array.isArray(credit.origin_reservations) ? credit.origin_reservations : [];
    const totalRetainedCents = credit.initial_amount_cents ?? 0;
    const totalOwnerValueCents = reservations.reduce((s, r) => s + Math.max(0, r.owner_value_cents ?? 0), 0);
    const totalAppliedCents = (applications ?? []).reduce((s: number, a: any) => s + (a.amount_applied_cents ?? 0), 0);
    const surplusCents = Math.max(0, totalRetainedCents - totalAppliedCents);

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
            ${reservations.map(r => `
              <tr>
                <td style="padding:8px;border-bottom:1px solid #f1f5f9">${formatDate(r.date)}</td>
                <td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9">${formatBRL(r.owner_value_cents ?? 0)}</td>
                <td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9;color:#b91c1c">- ${formatBRL(r.coverage_cents ?? 0)}</td>
                <td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9"><strong>${formatBRL(r.owner_receives_cents ?? 0)}</strong></td>
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

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const mailFrom = Deno.env.get('MAIL_FROM') || 'onboarding@resend.dev';
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: template } = await supabase
      .from('email_templates')
      .select('subject, body_html')
      .eq('key', 'reserve_debit_retroactive')
      .single();

    if (!template) {
      return new Response(
        JSON.stringify({ error: 'Email template reserve_debit_retroactive not found' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const debitDate = new Date(credit.created_at).toLocaleDateString('pt-BR');
    const subject = template.subject
      .replace(/\{\{property_name\}\}/g, propertyName)
      .replace(/\{\{owner_name\}\}/g, ownerProfile.name);

    const bodyHtml = template.body_html
      .replace(/\{\{owner_name\}\}/g, ownerProfile.name)
      .replace(/\{\{property_name\}\}/g, propertyName)
      .replace(/\{\{charge_title\}\}/g, chargeTitles)
      .replace(/\{\{debt_amount\}\}/g, formatBRL(totalRetainedCents))
      .replace(/\{\{debit_date\}\}/g, debitDate)
      .replace(/\{\{portal_url\}\}/g, '/minhas-cobrancas')
      .replace(/\{\{reservations_table\}\}/g, reservationsTableHtml)
      .replace(/\{\{surplus_block\}\}/g, surplusBlockHtml);

    const resend = new Resend(resendApiKey);
    const { error: sendError } = await resend.emails.send({
      from: mailFrom,
      to: [ownerProfile.email],
      subject,
      html: bodyHtml,
    });
    if (sendError) throw sendError;

    return new Response(
      JSON.stringify({ success: true, sentTo: ownerProfile.email, totalRetainedCents }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('resend-debit-email error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
