import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { renderTemplate, getTemplate } from '../_shared/template-renderer.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotifyRequest {
  type: "charge_created" | "charge_reminder" | "charge_overdue" | "charge_debit_notice" | "charge_paid";
  chargeId: string;
  diasRestantes?: string;
}

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

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

    // Fetch charge data
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

    // Get property name if available
    const { data: property } = charge.property_id
      ? await supabaseClient.from("properties").select("name, address").eq("id", charge.property_id).single()
      : { data: null };

    const totalAmountBRL = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: charge.currency || "BRL",
    }).format(charge.amount_cents / 100);

    const managementContributionBRL = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: charge.currency || "BRL",
    }).format((charge.management_contribution_cents || 0) / 100);

    const dueAmountBRL = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: charge.currency || "BRL",
    }).format((charge.amount_cents - (charge.management_contribution_cents || 0)) / 100);

    const formattedDueDate = charge.due_date
      ? new Intl.DateTimeFormat("pt-BR").format(new Date(charge.due_date))
      : "";

    const formattedMaintenanceDate = charge.maintenance_date
      ? new Intl.DateTimeFormat("pt-BR").format(new Date(charge.maintenance_date))
      : "";

    const portalUrl = Deno.env.get("PORTAL_URL") || "https://ktzfovzwayfqczytmhno.lovableproject.com";
    const chargeUrl = `${portalUrl}/cobranca-detalhes/${chargeId}`;
    
    const contestDeadline = charge.due_date 
      ? new Intl.DateTimeFormat("pt-BR").format(new Date(charge.due_date))
      : "";

    // Determine template key based on type
    let templateKey = "";
    switch (type) {
      case "charge_created":
        templateKey = "charge_created";
        break;
      case "charge_reminder":
        templateKey = "charge_reminder";
        break;
      case "charge_overdue":
        templateKey = "charge_overdue";
        break;
      case "charge_debit_notice":
        templateKey = "charge_debit_notice";
        break;
      case "charge_paid":
        templateKey = "charge_paid";
        break;
    }

    const template = await getTemplate(supabaseClient, templateKey);

    if (!template) {
      console.error("Template not found:", templateKey);
      return new Response(
        JSON.stringify({ error: "Template not found" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formattedPaidDate = charge.paid_at
      ? new Intl.DateTimeFormat("pt-BR").format(new Date(charge.paid_at))
      : "";

    const variables = {
      owner_name: charge.owner?.name || "Proprietário",
      owner_email: charge.owner?.email || "",
      charge_id: charge.id,
      charge_title: charge.title,
      charge_description: charge.description || "",
      charge_amount: totalAmountBRL, // Total amount
      total_amount: totalAmountBRL, // Total amount (alias)
      management_contribution: managementContributionBRL, // Management contribution
      due_amount: dueAmountBRL, // Amount owner needs to pay (total - management)
      maintenance_date: formattedMaintenanceDate, // Date of maintenance
      charge_due_date: formattedDueDate,
      due_date: formattedDueDate,
      paid_date: formattedPaidDate,
      payment_link: charge.payment_link_url || "",
      contest_deadline: contestDeadline,
      portal_url: chargeUrl,
      charge_url: chargeUrl,
      property_name: property?.name || "",
      property_address: property?.address || "",
      dias_restantes: diasRestantes || "",
    };

    const { error: emailError } = await resend.emails.send({
      from: "RIOS <sistema@rioshospedagens.com.br>",
      reply_to: "rioslagoon@gmail.com",
      to: [charge.owner?.email],
      subject: renderTemplate(template.subject, variables),
      html: renderTemplate(template.body_html, variables),
    });

    if (emailError) {
      console.error("Email send error:", emailError);
      throw emailError;
    }

    console.log("Email sent successfully");

    // Send push notification to owner
    try {
      let pushTitle = "";
      let pushBody = "";
      
      switch (type) {
        case "charge_created":
          pushTitle = "Nova Cobrança 💰";
          pushBody = `${charge.title} - ${dueAmountBRL} (Vence ${formattedDueDate})`;
          break;
        case "charge_reminder":
          pushTitle = "Lembrete de Cobrança ⏰";
          pushBody = `${charge.title} vence em breve - ${dueAmountBRL}`;
          break;
        case "charge_overdue":
          pushTitle = "Cobrança Vencida ⚠️";
          pushBody = `${charge.title} - ${dueAmountBRL} está vencida`;
          break;
        case "charge_debit_notice":
          pushTitle = "Aviso de Débito em Reserva ⚠️";
          pushBody = `${charge.title} - ${dueAmountBRL} será debitado`;
          break;
        case "charge_paid":
          pushTitle = "Pagamento Confirmado ✅";
          pushBody = `${charge.title} - ${dueAmountBRL} foi confirmado`;
          break;
      }

      await supabaseClient.functions.invoke("send-push", {
        body: {
          ownerId: charge.owner.id,
          payload: {
            title: pushTitle,
            body: pushBody,
            url: `/cobranca-detalhes/${chargeId}`,
            tag: `charge_${chargeId}`,
          },
        },
      });
      
      console.log("Push notification sent to owner");
    } catch (pushError) {
      console.error("Push notification error (non-critical):", pushError);
      // Don't fail the request if push fails
    }


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
