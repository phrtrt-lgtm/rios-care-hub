import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { renderTemplate, getTemplate } from '../_shared/template-renderer.ts';

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { commissionId } = await req.json();
    if (!commissionId) throw new Error("commissionId obrigatório");

    // Buscar comissão com proprietário e imóvel
    const { data: commission, error } = await supabase
      .from("booking_commissions")
      .select(`
        *,
        owner:profiles!booking_commissions_owner_id_fkey(id, name, email),
        property:properties!booking_commissions_property_id_fkey(name)
      `)
      .eq("id", commissionId)
      .single();

    if (error || !commission) throw new Error("Comissão não encontrada");

    const owner = commission.owner;
    const propertyName = commission.property?.name || "Imóvel";
    const totalBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
      .format(commission.total_due_cents / 100);
    const checkIn = new Intl.DateTimeFormat("pt-BR").format(new Date(commission.check_in + "T12:00:00"));
    const checkOut = new Intl.DateTimeFormat("pt-BR").format(new Date(commission.check_out + "T12:00:00"));
    const guestName = commission.guest_name || "Hóspede";

    const portalUrl = Deno.env.get("PORTAL_URL") || "https://portal.rioshospedagens.com.br";
    const commissionUrl = `${portalUrl}/minha-comissao-booking/${commissionId}`;

    const notificationTitle = "Nova Cobrança Booking";
    const notificationMessage = `${propertyName} – ${guestName} (${checkIn} a ${checkOut}) · ${totalBRL}`;

    // ── E-mail ao proprietário via template padrão ──────────────
    const template = await getTemplate(supabase, "booking_commission_created");

    if (!template) {
      console.error("Template booking_commission_created não encontrado");
      throw new Error("Template de e-mail não encontrado");
    }

    const variables = {
      owner_name: owner.name,
      property_name: propertyName,
      guest_name: guestName,
      check_in: checkIn,
      check_out: checkOut,
      total_due: totalBRL,
      commission_url: commissionUrl,
    };

    const { error: emailError } = await resend.emails.send({
      from: "RIOS <sistema@rioshospedagens.com.br>",
      reply_to: "rioslagoon@gmail.com",
      to: [owner.email],
      subject: renderTemplate(template.subject, variables),
      html: renderTemplate(template.body_html, variables),
    });

    if (emailError) {
      console.error("Erro ao enviar e-mail:", emailError);
      throw emailError;
    }

    console.log(`E-mail enviado para ${owner.email}`);

    // ── Notificação in-app ──────────────────────────────────────
    const { error: notifError } = await supabase.from("notifications").insert({
      owner_id: owner.id,
      title: notificationTitle,
      message: notificationMessage,
      type: "charge",
      reference_id: commissionId,
      reference_url: `/minha-comissao-booking/${commissionId}`,
      read: false,
    });

    if (notifError) {
      console.error("Erro ao criar notificação (non-critical):", notifError);
    }

    // ── Push ────────────────────────────────────────────────────
    try {
      await supabase.functions.invoke("send-push", {
        body: {
          ownerId: owner.id,
          payload: {
            title: notificationTitle,
            body: notificationMessage,
            url: `/minha-comissao-booking/${commissionId}`,
            tag: `booking_commission_${commissionId}`,
          },
        },
      });
      console.log("Push enviado");
    } catch (pushErr) {
      console.error("Push error (non-critical):", pushErr);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("notify-booking-commission error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
