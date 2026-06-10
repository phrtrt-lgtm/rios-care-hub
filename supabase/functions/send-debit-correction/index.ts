import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { to, ownerName, propertyName, oldCommission, newCommission, oldBase, newBase, oldExtra, newExtra, ownerValue, debtTotal, ownerReceives, remainingDebt, checkinDate } = await req.json();

    const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
        <h2 style="color:#b45309;margin:0 0 8px">Carta de Correção – Débito em Reserva</h2>
        <p>Olá, <strong>${ownerName}</strong>.</p>
        <p>Identificamos um equívoco no cálculo do débito em reserva enviado anteriormente referente ao imóvel <strong>${propertyName}</strong> (check-in em ${checkinDate}). A comissão base utilizada estava em <strong>${oldBase}%</strong>, quando o correto, conforme seu contrato, é <strong>${newBase}%</strong>.</p>
        <p>Pedimos desculpas pelo transtorno e seguimos com o cálculo correto abaixo. <strong>Este aviso substitui integralmente o anterior.</strong></p>

        <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:16px;margin:16px 0">
          <h3 style="margin:0 0 8px;color:#92400e">Cálculo corrigido</h3>
          <table style="width:100%;font-size:14px;border-collapse:collapse">
            <tr><td style="padding:4px 0">Valor do proprietário na reserva:</td><td style="text-align:right"><strong>${fmt(ownerValue)}</strong></td></tr>
            <tr><td style="padding:4px 0">Dívida total a cobrir:</td><td style="text-align:right;color:#b91c1c"><strong>${fmt(debtTotal)}</strong></td></tr>
            <tr><td style="padding:4px 0">Comissão base:</td><td style="text-align:right"><strong>${newBase}%</strong></td></tr>
            <tr><td style="padding:4px 0">Comissão extra (cobertura da dívida):</td><td style="text-align:right"><strong>${newExtra}%</strong></td></tr>
            <tr style="border-top:1px solid #fcd34d"><td style="padding:8px 0">Comissão total a ser configurada na reserva:</td><td style="text-align:right"><strong style="font-size:18px">${newCommission}%</strong></td></tr>
            <tr><td style="padding:4px 0">Proprietário receberá:</td><td style="text-align:right"><strong>${fmt(ownerReceives)}</strong></td></tr>
            ${remainingDebt > 0.01 ? `<tr><td style="padding:4px 0;color:#92400e">Saldo remanescente da dívida:</td><td style="text-align:right;color:#92400e"><strong>${fmt(remainingDebt)}</strong></td></tr>` : ""}
          </table>
        </div>

        <p style="font-size:13px;color:#555">Correção: comissão total ajustada de <s>${oldCommission}%</s> para <strong>${newCommission}%</strong> (base <s>${oldBase}%</s> → <strong>${newBase}%</strong>, extra <s>${oldExtra}%</s> → <strong>${newExtra}%</strong>).</p>

        <p>Qualquer dúvida, estamos à disposição.</p>
        <p style="color:#666;font-size:13px;margin-top:24px">— Equipe RIOS Hospedagens</p>
      </div>
    `;

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    const { error } = await resend.emails.send({
      from: "RIOS <sistema@rioshospedagens.com.br>",
      reply_to: "rioslagoon@gmail.com",
      to: [to],
      subject: `Carta de Correção – Débito em Reserva (${propertyName})`,
      html,
    });
    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
