import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@4.0.0";
import { renderAsync } from "npm:@react-email/components@0.0.22";
import React from "npm:react@18.3.1";
import {
  ChargeCreatedToOwnerEmail,
  ChargeReminderEmail,
  ChargeOverdueEmail,
  ChargeDebitNoticeEmail,
  ChargePaidEmail,
  ChargeProofReceivedEmail,
  ChargeContestedEmail,
} from "../_shared/email-templates.tsx";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface NotifyRequest {
  type: 
    | "charge_created_owner"
    | "charge_created_admin"
    | "charge_reminder"
    | "charge_overdue"
    | "charge_debit_notice"
    | "charge_paid_owner"
    | "charge_paid_team"
    | "charge_proof_received"
    | "charge_contested"
    | "charge_debited_owner"
    | "charge_debited_team";
  chargeId: string;
  diasRestantes?: string;
}

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const adminEmails = (Deno.env.get("ADMIN_NOTIFY_EMAILS") || "").split(",");

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { type, chargeId, diasRestantes }: NotifyRequest = await req.json();

    console.log("Email notification request:", { type, chargeId, diasRestantes });

    // Buscar dados da cobrança
    const { data: charge, error: chargeError } = await supabaseClient
      .from("charges")
      .select(`
        *,
        owner:profiles!charges_owner_id_fkey(id, name, email)
      `)
      .eq("id", chargeId)
      .single();

    if (chargeError || !charge) {
      console.error("Charge not found:", chargeError);
      return new Response(
        JSON.stringify({ error: "Charge not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar configurações do sistema
    const { data: configData } = await supabaseClient
      .from("system_config")
      .select("*")
      .in("key", ["email_signature", "billing_rules"]);

    const emailSignature = configData?.find((c) => c.key === "email_signature")?.value || {
      company_name: "RIOS – Operação e Gestão de Hospedagens",
      support_email: "suporte@rios.com.br",
      support_phone: "+55 (00) 0000-0000",
    };

    const baseUrl = Deno.env.get("SUPABASE_URL")?.replace("/v1", "") || "";
    const chargeUrl = `${baseUrl}/cobranca/${chargeId}`;
    const rulesUrl = `${baseUrl}/regras-cobrancas`;

    const amountBr = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: charge.currency || "BRL",
    }).format(charge.amount_cents / 100);

    const dueDateBr = charge.due_date
      ? new Intl.DateTimeFormat("pt-BR").format(new Date(charge.due_date))
      : "";

    const ownerName = charge.owner?.name || "Proprietário";
    const ownerEmail = charge.owner?.email;

    let emailHtml = "";
    let subject = "";
    let toEmail: string[] = [];

    switch (type) {
      case "charge_created_owner":
        subject = `[RIOS] Nova cobrança – vence em 7 dias: ${charge.title}`;
        toEmail = [ownerEmail];
        emailHtml = await renderAsync(
          React.createElement(ChargeCreatedToOwnerEmail, {
            ownerName,
            chargeId,
            title: charge.title,
            description: charge.description,
            amountBr,
            dueDateBr,
            chargeUrl,
            rulesUrl,
            signature: emailSignature,
          })
        );
        break;

      case "charge_created_admin":
        subject = `[RIOS] Cobrança enviada a ${ownerName}: ${charge.title}`;
        toEmail = adminEmails;
        emailHtml = `
          <h2>Nova cobrança criada</h2>
          <p><strong>Proprietário:</strong> ${ownerName}</p>
          <p><strong>Cobrança:</strong> ${charge.title}</p>
          <p><strong>Valor:</strong> ${amountBr}</p>
          <p><strong>Vencimento:</strong> ${dueDateBr}</p>
          <p><a href="${chargeUrl}">Ver cobrança</a></p>
        `;
        break;

      case "charge_reminder":
        subject = `[RIOS] Lembrete: cobrança vence em ${diasRestantes} dias – ${charge.title}`;
        toEmail = [ownerEmail];
        emailHtml = await renderAsync(
          React.createElement(ChargeReminderEmail, {
            ownerName,
            chargeId,
            title: charge.title,
            amountBr,
            dueDateBr,
            chargeUrl,
            rulesUrl,
            signature: emailSignature,
            diasRestantes: diasRestantes || "X",
          })
        );
        break;

      case "charge_overdue":
        subject = `[RIOS] Cobrança vencida – ação necessária: ${charge.title}`;
        toEmail = [ownerEmail];
        emailHtml = await renderAsync(
          React.createElement(ChargeOverdueEmail, {
            ownerName,
            chargeId,
            title: charge.title,
            description: charge.description,
            amountBr,
            dueDateBr,
            chargeUrl,
            rulesUrl,
            signature: emailSignature,
          })
        );
        break;

      case "charge_debit_notice":
        subject = `[RIOS] Aviso: cobrança será debitada de reservas futuras – ${charge.title}`;
        toEmail = [ownerEmail];
        emailHtml = await renderAsync(
          React.createElement(ChargeDebitNoticeEmail, {
            ownerName,
            chargeId,
            title: charge.title,
            description: charge.description,
            amountBr,
            dueDateBr,
            chargeUrl,
            rulesUrl,
            signature: emailSignature,
          })
        );
        break;

      case "charge_paid_owner":
        subject = `[RIOS] Pagamento confirmado – ${charge.title}`;
        toEmail = [ownerEmail];
        emailHtml = await renderAsync(
          React.createElement(ChargePaidEmail, {
            ownerName,
            chargeId,
            title: charge.title,
            description: charge.description,
            amountBr,
            dueDateBr,
            chargeUrl,
            rulesUrl,
            signature: emailSignature,
          })
        );
        break;

      case "charge_paid_team":
        subject = `[RIOS] Cobrança paga – ${ownerName} – ${charge.title}`;
        toEmail = adminEmails;
        emailHtml = `
          <h2>Cobrança paga</h2>
          <p><strong>Proprietário:</strong> ${ownerName}</p>
          <p><strong>Cobrança:</strong> ${charge.title}</p>
          <p><strong>Valor:</strong> ${amountBr}</p>
          <p><a href="${chargeUrl}">Ver cobrança</a></p>
        `;
        break;

      case "charge_proof_received":
        subject = `[RIOS] Comprovante recebido – revisar cobrança: ${charge.title}`;
        toEmail = adminEmails;
        emailHtml = await renderAsync(
          React.createElement(ChargeProofReceivedEmail, {
            ownerName,
            title: charge.title,
            chargeUrl,
            rulesUrl,
            signature: emailSignature,
          })
        );
        break;

      case "charge_contested":
        subject = `[RIOS] Cobrança contestada por ${ownerName} – ${charge.title}`;
        toEmail = adminEmails;
        emailHtml = await renderAsync(
          React.createElement(ChargeContestedEmail, {
            ownerName,
            title: charge.title,
            chargeUrl,
            rulesUrl,
            signature: emailSignature,
          })
        );
        break;

      case "charge_debited_owner":
      case "charge_debited_team":
        subject = `[RIOS] Débito realizado em reservas futuras – ${charge.title}`;
        toEmail = type === "charge_debited_owner" ? [ownerEmail] : adminEmails;
        emailHtml = `
          <h2>Débito realizado</h2>
          <p><strong>Proprietário:</strong> ${ownerName}</p>
          <p><strong>Cobrança:</strong> ${charge.title}</p>
          <p><strong>Valor:</strong> ${amountBr}</p>
          <p>O valor foi debitado de reservas futuras.</p>
        `;
        break;
    }

    if (!toEmail.length || !emailHtml) {
      return new Response(
        JSON.stringify({ error: "Invalid email configuration" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: emailError } = await resend.emails.send({
      from: "RIOS <onboarding@resend.dev>",
      to: toEmail,
      subject,
      html: emailHtml,
    });

    if (emailError) {
      console.error("Email send error:", emailError);
      throw emailError;
    }

    console.log("Email sent successfully:", { type, to: toEmail });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-charge-email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);