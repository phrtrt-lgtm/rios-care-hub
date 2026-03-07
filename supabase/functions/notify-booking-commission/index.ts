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

    const subject = `Nova Comissão Booking – ${propertyName}`;
    const notificationTitle = "Nova Cobrança Booking";
    const notificationMessage = `${propertyName} – ${guestName} (${checkIn} a ${checkOut}) · ${totalBRL}`;

    // ── E-mail ao proprietário ──────────────────────────────────
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="background: #1a1a2e; padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 20px;">RIOS Hospedagens</h1>
        </div>
        <div style="padding: 32px 24px;">
          <h2 style="color: #1a1a2e; margin-top: 0;">Nova Comissão Booking</h2>
          <p>Olá, <strong>${owner.name}</strong>!</p>
          <p>Uma nova cobrança de comissão foi registrada para o imóvel <strong>${propertyName}</strong>.</p>

          <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #1a1a2e;">
            <p style="margin: 6px 0;"><strong>Imóvel:</strong> ${propertyName}</p>
            <p style="margin: 6px 0;"><strong>Hóspede:</strong> ${guestName}</p>
            <p style="margin: 6px 0;"><strong>Check-in:</strong> ${checkIn}</p>
            <p style="margin: 6px 0;"><strong>Check-out:</strong> ${checkOut}</p>
            <p style="margin: 12px 0 0; font-size: 18px;"><strong>Total devido: <span style="color: #e65100;">${totalBRL}</span></strong></p>
          </div>

          <p>Acesse o portal para visualizar os detalhes e realizar o pagamento:</p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${commissionUrl}" style="background: #1a1a2e; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
              Ver Cobrança
            </a>
          </div>
        </div>
        <div style="background: #f0f0f0; padding: 16px; text-align: center; font-size: 12px; color: #666;">
          RIOS Hospedagens · sistema@rioshospedagens.com.br
        </div>
      </div>
    `;

    await resend.emails.send({
      from: "RIOS <sistema@rioshospedagens.com.br>",
      reply_to: "rioslagoon@gmail.com",
      to: [owner.email],
      subject,
      html: emailHtml,
    });

    console.log(`E-mail enviado para ${owner.email}`);

    // ── Notificação in-app ──────────────────────────────────────
    await supabase.from("notifications").insert({
      owner_id: owner.id,
      title: notificationTitle,
      message: notificationMessage,
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
