import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { v4 as uuidv4 } from "https://esm.sh/uuid@9.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const mercadoPagoToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { curation_id, total_amount_cents, selected_items } = await req.json();
    if (!curation_id) throw new Error("curation_id obrigatório");
    if (!total_amount_cents || total_amount_cents < 100) throw new Error("Valor total inválido");
    const items = Array.isArray(selected_items) ? selected_items : [];

    // Sem checagem de ownership — basta a curadoria existir e estar publicada.
    // O PIX é nominal ao owner_id da curadoria, então não há risco de cobrar a pessoa errada.
    const { data: curation, error: curErr } = await supabase
      .from("owner_curations")
      .select("id, owner_id, title, status, paid_at, pix_qr_code, pix_qr_code_base64, total_amount_cents")
      .eq("id", curation_id)
      .eq("status", "published")
      .single();

    if (curErr || !curation) throw new Error("Curadoria não encontrada");
    if (curation.paid_at) throw new Error("Curadoria já paga");

    // Se já tem PIX gerado e valor é o mesmo, devolve o existente (idempotência leve)
    if (
      curation.pix_qr_code &&
      curation.pix_qr_code_base64 &&
      curation.total_amount_cents === total_amount_cents
    ) {
      return new Response(
        JSON.stringify({
          pix_qr_code: curation.pix_qr_code,
          pix_qr_code_base64: curation.pix_qr_code_base64,
          total_amount_cents: curation.total_amount_cents,
          reused: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Owner (sempre o dono da curadoria)
    const { data: owner } = await supabase
      .from("profiles")
      .select("name, email")
      .eq("id", curation.owner_id)
      .single();

    const totalAmount = total_amount_cents / 100;

    const titleSlug = (curation.title || "curadoria")
      .replace(/\s+/g, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .substring(0, 20);

    const idempotencyKey = uuidv4();

    const pixPayload = {
      transaction_amount: totalAmount,
      description: `curadoriaRIOS${titleSlug}`,
      payment_method_id: "pix",
      payer: { email: owner?.email || "noreply@rioshospedagens.com.br" },
      external_reference: `curation:${curation.id}`,
      notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
      metadata: {
        type: "curation_payment",
        curation_id: curation.id,
        owner_id: curation.owner_id,
      },
    };

    const pixResponse = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mercadoPagoToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(pixPayload),
    });

    if (!pixResponse.ok) {
      const err = await pixResponse.text();
      console.error("MP PIX curation error:", err);
      throw new Error(`Erro ao gerar PIX: ${err}`);
    }

    const pixData = await pixResponse.json();
    const pixQrCode = pixData.point_of_interaction?.transaction_data?.qr_code;
    const pixQrCodeBase64 = pixData.point_of_interaction?.transaction_data?.qr_code_base64;

    await supabase
      .from("owner_curations")
      .update({
        pix_qr_code: pixQrCode,
        pix_qr_code_base64: `data:image/png;base64,${pixQrCodeBase64}`,
        mercadopago_payment_id: String(pixData.id),
        total_amount_cents,
        selected_items: items,
      })
      .eq("id", curation.id);

    return new Response(
      JSON.stringify({
        pix_qr_code: pixQrCode,
        pix_qr_code_base64: `data:image/png;base64,${pixQrCodeBase64}`,
        total_amount_cents,
        payment_id: pixData.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("create-curation-pix error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
