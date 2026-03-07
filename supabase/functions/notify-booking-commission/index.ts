import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { generateChargeEmailHTML } from "../_shared/email-utils.ts";

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
    const commissionBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
      .format(commission.commission_cents / 100);
    const cleaningBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
      .format(commission.cleaning_fee_cents / 100);

    const checkIn = new Intl.DateTimeFormat("pt-BR").format(new Date(commission.check_in + "T12:00:00"));
    const checkOut = new Intl.DateTimeFormat("pt-BR").format(new Date(commission.check_out + "T12:00:00"));
    const guestName = commission.guest_name || "Hóspede";

    const portalUrl = Deno.env.get("PORTAL_URL") || "https://portal.rioshospedagens.com.br";
    const commissionUrl = `${portalUrl}/minha-comissao-booking/${commissionId}`;

    const dueDate = commission.due_date
      ? new Intl.DateTimeFormat("pt-BR").format(new Date(commission.due_date + "T12:00:00"))
      : "A definir";

    const notificationTitle = "Nova Cobrança Booking";
    const notificationMessage = `${propertyName} – ${guestName} (${checkIn} a ${checkOut}) · ${totalBRL}`;

    // ── E-mail usando o layout padrão de cobranças ──────────────
    const emailHtml = generateChargeEmailHTML({
      ownerName: owner.name,
      chargeTitle: `Comissão Booking – ${propertyName}`,
      amountBRL: totalBRL,
      totalAmount: totalBRL,
      managementContribution: undefined,
      dueAmount: totalBRL,
      maintenanceDate: `${checkIn} a ${checkOut} · Hóspede: ${guestName}`,
      dueDate,
      paymentLink: commission.payment_link_url || undefined,
      description: `Comissão (${commission.commission_percent}%): ${commissionBRL} · Taxa de limpeza: ${cleaningBRL}`,
      contestDeadline: undefined,
      portalUrl: commissionUrl,
    });

    const { error: emailError } = await resend.emails.send({
      from: "RIOS <sistema@rioshospedagens.com.br>",
      reply_to: "rioslagoon@gmail.com",
      to: [owner.email],
      subject: `Nova Cobrança Booking – ${propertyName} (${checkIn} a ${checkOut})`,
      html: emailHtml,
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
