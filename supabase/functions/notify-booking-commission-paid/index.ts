import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

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

    const { commissionId, paymentId } = await req.json();
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

    const fmt = (cents: number) =>
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

    const totalBRL = fmt(commission.total_due_cents);
    const checkIn = new Intl.DateTimeFormat("pt-BR").format(new Date(commission.check_in + "T12:00:00"));
    const checkOut = new Intl.DateTimeFormat("pt-BR").format(new Date(commission.check_out + "T12:00:00"));
    const guestName = commission.guest_name || "Hóspede";
    const paidAt = commission.paid_at
      ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(commission.paid_at))
      : new Intl.DateTimeFormat("pt-BR").format(new Date());

    const portalUrl = Deno.env.get("PORTAL_URL") || "https://portal.rioshospedagens.com.br";
    const commissionUrl = `${portalUrl}/minha-comissao-booking/${commissionId}`;

    // ── E-mail de confirmação de pagamento ──────────────────────
    const { error: emailError } = await resend.emails.send({
      from: "RIOS <sistema@rioshospedagens.com.br>",
      reply_to: "rioslagoon@gmail.com",
      to: [owner.email],
      subject: `✅ Pagamento confirmado – ${propertyName} (${guestName})`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #1a1a2e; padding: 20px; border-radius: 8px; margin-bottom: 24px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 22px;">✅ Pagamento Confirmado</h1>
          </div>

          <p style="color: #333; font-size: 15px;">Olá, <strong>${owner.name}</strong>!</p>
          <p style="color: #333; font-size: 15px;">Recebemos seu pagamento referente à comissão Booking abaixo:</p>

          <div style="background: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px;">Imóvel</td>
                <td style="padding: 8px 0; font-weight: bold; text-align: right; font-size: 14px;">${propertyName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px;">Hóspede</td>
                <td style="padding: 8px 0; text-align: right; font-size: 14px;">${guestName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px;">Check-in / Check-out</td>
                <td style="padding: 8px 0; text-align: right; font-size: 14px;">${checkIn} – ${checkOut}</td>
              </tr>
              <tr style="border-top: 1px solid #e0e0e0;">
                <td style="padding: 12px 0 0 0; color: #333; font-size: 15px; font-weight: bold;">Total Pago</td>
                <td style="padding: 12px 0 0 0; text-align: right; font-size: 18px; font-weight: bold; color: #22c55e;">${totalBRL}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #666; font-size: 13px;">Data do pagamento</td>
                <td style="padding: 4px 0; text-align: right; font-size: 13px; color: #666;">${paidAt}</td>
              </tr>
            </table>
          </div>

          <p style="text-align: center; margin: 24px 0;">
            <a href="${commissionUrl}" style="background: #1a1a2e; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: bold;">
              Ver comprovante no portal
            </a>
          </p>

          <p style="color: #888; font-size: 13px; text-align: center; margin-top: 32px;">
            RIOS Hospedagens &nbsp;·&nbsp; <a href="mailto:rioslagoon@gmail.com" style="color: #888;">rioslagoon@gmail.com</a>
          </p>
        </div>
      `,
    });

    if (emailError) {
      console.error("Erro ao enviar e-mail:", emailError);
    } else {
      console.log(`E-mail de confirmação enviado para ${owner.email}`);
    }

    // ── Notificação in-app ──────────────────────────────────────
    const message = `${propertyName} – ${guestName} (${checkIn} a ${checkOut}) · ${totalBRL} pago`;
    await supabase.from("notifications").insert({
      owner_id: owner.id,
      title: "✅ Pagamento Booking Confirmado",
      message,
      type: "charge",
      reference_id: commissionId,
      reference_url: `/minha-comissao-booking/${commissionId}`,
      read: false,
    });

    // ── Push ────────────────────────────────────────────────────
    try {
      await supabase.functions.invoke("send-push", {
        body: {
          ownerId: owner.id,
          payload: {
            title: "✅ Pagamento Booking Confirmado",
            body: message,
            url: `/minha-comissao-booking/${commissionId}`,
            tag: `booking_paid_${commissionId}`,
          },
        },
      });
    } catch (pushErr) {
      console.error("Push error (non-critical):", pushErr);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("notify-booking-commission-paid error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
