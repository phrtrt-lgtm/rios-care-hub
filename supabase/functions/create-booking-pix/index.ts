import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { v4 as uuidv4 } from "https://esm.sh/uuid@9.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const mercadoPagoToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Não autorizado");

    const { commissionIds }: { commissionIds: string[] } = await req.json();
    if (!commissionIds || commissionIds.length === 0) throw new Error("Nenhuma cobrança selecionada");

    // Buscar comissões — valida que pertencem ao owner
    const { data: commissions, error: comErr } = await supabase
      .from("booking_commissions")
      .select("id, guest_name, check_in, check_out, total_due_cents, status, owner_id, property:property_id(name)")
      .in("id", commissionIds)
      .eq("owner_id", user.id);

    if (comErr || !commissions?.length) throw new Error("Cobranças não encontradas");

    const invalid = commissions.filter(c => !["sent", "pendente", "overdue"].includes(c.status));
    if (invalid.length > 0) throw new Error("Algumas cobranças não estão em aberto");

    // Owner
    const { data: owner } = await supabase
      .from("profiles")
      .select("name, email")
      .eq("id", user.id)
      .single();

    const totalCents = commissions.reduce((s, c) => s + c.total_due_cents, 0);
    const totalAmount = totalCents / 100;

    // Montar slug da unidade para identificação no extrato
    const firstProperty = (commissions[0] as any).property;
    const unitSlug = firstProperty?.name
      ? firstProperty.name.replace(/\s+/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').substring(0, 20)
      : 'SemUnidade';
    const description = commissions.length === 1
      ? `comissao${unitSlug}`
      : `comissao${unitSlug}x${commissions.length}`;

    // Chave de idempotência única por conjunto de IDs
    const idempotencyKey = uuidv4();

    // Criar pagamento PIX
    const pixPayload = {
      transaction_amount: totalAmount,
      description,
      payment_method_id: "pix",
      payer: { email: owner?.email || "noreply@example.com" },
      external_reference: commissionIds.join(","),
      notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
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
      console.error("MP PIX error:", err);
      throw new Error(`Erro ao gerar PIX: ${err}`);
    }

    const pixData = await pixResponse.json();
    const pixQrCode = pixData.point_of_interaction?.transaction_data?.qr_code;
    const pixQrCodeBase64 = pixData.point_of_interaction?.transaction_data?.qr_code_base64;

    // Salvar dados nas comissões (todas recebem o mesmo QR, referência agrupada)
    await supabase
      .from("booking_commissions")
      .update({
        pix_qr_code: pixQrCode,
        pix_qr_code_base64: `data:image/png;base64,${pixQrCodeBase64}`,
        mercadopago_payment_id: String(pixData.id),
      })
      .in("id", commissionIds);

    return new Response(
      JSON.stringify({
        pix_qr_code: pixQrCode,
        pix_qr_code_base64: `data:image/png;base64,${pixQrCodeBase64}`,
        total_amount_cents: totalCents,
        payment_id: pixData.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("create-booking-pix error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
