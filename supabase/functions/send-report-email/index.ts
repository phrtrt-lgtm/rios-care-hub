import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { renderTemplate, getTemplate } from '../_shared/template-renderer.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    const { ownerName, ownerEmail, propertyName, reportType, periodStart, periodEnd, totalReservations, totalValue } = body;

    if (!ownerEmail) {
      return new Response(
        JSON.stringify({ error: "Missing ownerEmail" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formatCurrency = (v: number) =>
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

    const formatDate = (d: string) =>
      d ? new Intl.DateTimeFormat("pt-BR").format(new Date(d)) : "";

    const reportTypeLabels: Record<string, string> = {
      management: "Relatório da Gestão",
      management_cleaning: "Gestão + Limpeza",
      owner: "Relatório do Proprietário",
      owner_management: "Proprietário + Gestão",
      owner_management_cleaning: "Proprietário + Gestão + Limpeza",
    };

    const template = await getTemplate(supabaseClient, "financial_report_published");

    const portalUrl = Deno.env.get("PORTAL_URL") || "https://portal.rioshospedagens.com.br";

    const variables = {
      owner_name: ownerName || "Proprietário",
      property_name: propertyName,
      report_type: reportTypeLabels[reportType] || reportType,
      period_start: formatDate(periodStart),
      period_end: formatDate(periodEnd),
      total_reservations: String(totalReservations || 0),
      total_value: formatCurrency(totalValue || 0),
      portal_url: portalUrl,
    };

    let subject = `Relatório Financeiro - ${propertyName}`;
    let html = "";

    if (template) {
      subject = renderTemplate(template.subject, variables);
      html = renderTemplate(template.body_html, variables);
    } else {
      // Fallback inline template
      html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <div style="background: linear-gradient(135deg, #0f3150 0%, #1a4a7a 100%); padding: 40px 20px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">RIOS</h1>
      <p style="color: rgba(255, 255, 255, 0.9); margin: 8px 0 0 0; font-size: 14px;">Operação e Gestão de Hospedagens</p>
    </div>
    <div style="padding: 40px 32px;">
      <p style="color: #1a1a1a; font-size: 16px; margin: 0 0 24px 0;">Olá ${variables.owner_name},</p>
      <p style="color: #4a4a4a; font-size: 15px; margin: 0 0 24px 0;">
        Seu relatório financeiro está disponível para visualização no portal.
      </p>
      <div style="background-color: #f8f9fa; border-left: 4px solid #d36b4d; padding: 20px; margin: 0 0 24px 0; border-radius: 4px;">
        <p style="margin: 0 0 12px 0; color: #1a1a1a;"><strong>Imóvel:</strong> ${variables.property_name}</p>
        <p style="margin: 0 0 12px 0; color: #1a1a1a;"><strong>Tipo:</strong> ${variables.report_type}</p>
        <p style="margin: 0 0 12px 0; color: #1a1a1a;"><strong>Período:</strong> ${variables.period_start} a ${variables.period_end}</p>
        <p style="margin: 0 0 12px 0; color: #1a1a1a;"><strong>Reservas:</strong> ${variables.total_reservations}</p>
        <p style="margin: 0; color: #1a1a1a; font-size: 18px;"><strong>Receita:</strong> <span style="color: #d36b4d; font-size: 24px; font-weight: 600;">${variables.total_value}</span></p>
      </div>
      <div style="margin: 32px 0; text-align: center;">
        <a href="${variables.portal_url}" style="display: inline-block; background-color: #d36b4d; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 15px;">
          Ver Relatório Completo
        </a>
      </div>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
      <p style="color: #1a1a1a; font-size: 14px; margin: 24px 0 0 0;">
        Atenciosamente,<br><strong>Equipe RIOS</strong>
      </p>
    </div>
    <div style="background-color: #f8f9fa; padding: 24px 32px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        © ${new Date().getFullYear()} RIOS - Operação e Gestão de Hospedagens<br>
        Este é um e-mail automático, por favor não responda.
      </p>
    </div>
  </div>
</body>
</html>`;
    }

    const mailFrom = Deno.env.get("MAIL_FROM") || "RIOS <sistema@rioshospedagens.com.br>";
    const mailReplyTo = Deno.env.get("MAIL_REPLY_TO") || "rioslagoon@gmail.com";

    const { error: emailError } = await resend.emails.send({
      from: mailFrom,
      reply_to: mailReplyTo,
      to: [ownerEmail],
      subject,
      html,
    });

    if (emailError) {
      console.error("Email send error:", emailError);
      throw emailError;
    }

    // Create notification
    const { data: ownerProfile } = await supabaseClient
      .from("profiles")
      .select("id")
      .eq("email", ownerEmail)
      .single();

    if (ownerProfile) {
      await supabaseClient.from("notifications").insert({
        owner_id: ownerProfile.id,
        title: "Novo Relatório Financeiro",
        message: `Relatório de ${propertyName} disponível para visualização`,
        type: "report",
        reference_url: "/meus-relatorios",
        read: false,
      });
    }

    console.log("Report email sent to:", ownerEmail);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-report-email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
