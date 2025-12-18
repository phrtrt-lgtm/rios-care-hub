import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreatePaymentRequest {
  chargeId: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const mercadoPagoToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { chargeId }: CreatePaymentRequest = await req.json();

    console.log('Creating MercadoPago payment for charge:', chargeId);

    // Buscar dados da cobrança
    const { data: charge, error: chargeError } = await supabase
      .from('charges')
      .select(`
        *,
        properties (
          name
        )
      `)
      .eq('id', chargeId)
      .single();

    if (chargeError || !charge) {
      console.error('Charge not found:', chargeError);
      throw new Error('Cobrança não encontrada');
    }

    // Buscar dados do proprietário separadamente
    const { data: owner, error: ownerError } = await supabase
      .from('profiles')
      .select('name, email, phone')
      .eq('id', charge.owner_id)
      .single();

    if (ownerError || !owner) {
      console.error('Owner not found:', ownerError);
      throw new Error('Proprietário não encontrado');
    }

    // Verificar se já existe um payment_link
    if (charge.payment_link) {
      console.log('Payment link already exists:', charge.payment_link);
      return new Response(
        JSON.stringify({ payment_link: charge.payment_link }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const property = charge.properties;

    // Buscar pagamentos já feitos para calcular o valor devido
    const { data: payments, error: paymentsError } = await supabase
      .from('charge_payments')
      .select('amount_cents')
      .eq('charge_id', chargeId);

    if (paymentsError) {
      console.error('Error fetching payments:', paymentsError);
    }

    // Calcular valor devido (total - aporte - pagamentos já feitos)
    const totalPaidCents = payments?.reduce((sum, p) => sum + p.amount_cents, 0) || 0;
    const dueAmountCents = charge.amount_cents - charge.management_contribution_cents - totalPaidCents;
    const dueAmount = dueAmountCents / 100;

    console.log('Charge amount calculation:', {
      totalAmountCents: charge.amount_cents,
      managementContributionCents: charge.management_contribution_cents,
      totalPaidCents,
      dueAmountCents,
      dueAmount
    });

    // Verificar se há valor devido
    if (dueAmountCents <= 0) {
      console.log('No amount due for this charge');
      return new Response(
        JSON.stringify({ error: 'Não há valor devido para esta cobrança' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Criar preferência de pagamento no Mercado Pago
    const preferencePayload = {
      items: [
        {
          title: charge.title || 'Cobrança de Manutenção',
          description: charge.description || '',
          quantity: 1,
          currency_id: 'BRL',
          unit_price: dueAmount,
        }
      ],
      payer: {
        name: owner.name || '',
        email: owner.email || '',
        phone: {
          area_code: owner.phone?.substring(0, 2) || '',
          number: owner.phone?.substring(2) || '',
        }
      },
      payment_methods: {
        installments: 12, // Permite parcelamento em até 12x
        default_installments: 1,
      },
      back_urls: {
        success: 'https://portal.rioshospedagens.com.br/minhas-cobrancas',
        failure: 'https://portal.rioshospedagens.com.br/minhas-cobrancas',
        pending: 'https://portal.rioshospedagens.com.br/minhas-cobrancas',
      },
      auto_return: 'approved',
      external_reference: chargeId,
      notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
      statement_descriptor: 'RIOS Gestao',
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: new Date(charge.due_date).toISOString(),
    };

    console.log('Creating MercadoPago preference:', preferencePayload);

    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mercadoPagoToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preferencePayload),
    });

    if (!mpResponse.ok) {
      const errorText = await mpResponse.text();
      console.error('MercadoPago API error:', errorText);
      throw new Error(`Erro ao criar pagamento no Mercado Pago: ${errorText}`);
    }

    const mpData = await mpResponse.json();
    console.log('MercadoPago preference created:', mpData);

    const paymentLink = mpData.init_point; // Link de pagamento

    // Buscar detalhes do pagamento PIX para obter QR code
    let pixQrCode = null;
    let pixQrCodeBase64 = null;

    // Criar pagamento PIX para gerar QR code
    const pixPaymentPayload = {
      transaction_amount: dueAmount,
      description: charge.title || 'Cobrança de Manutenção',
      payment_method_id: 'pix',
      payer: {
        email: owner.email || 'noreply@example.com',
      },
      external_reference: chargeId,
      notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
    };

    const pixResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mercadoPagoToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': chargeId, // Usar o ID da cobrança como chave de idempotência
      },
      body: JSON.stringify(pixPaymentPayload),
    });

    if (pixResponse.ok) {
      const pixData = await pixResponse.json();
      console.log('PIX payment created:', pixData);
      pixQrCode = pixData.point_of_interaction?.transaction_data?.qr_code;
      pixQrCodeBase64 = pixData.point_of_interaction?.transaction_data?.qr_code_base64;
    } else {
      const errorText = await pixResponse.text();
      console.error('Error creating PIX payment:', errorText);
    }

    // Atualizar cobrança com o link de pagamento e QR code
    const { error: updateError } = await supabase
      .from('charges')
      .update({ 
        payment_link: paymentLink,
        mercadopago_preference_id: mpData.id,
        pix_qr_code: pixQrCode,
        pix_qr_code_base64: pixQrCodeBase64,
      })
      .eq('id', chargeId);

    if (updateError) {
      console.error('Error updating charge:', updateError);
      throw new Error('Erro ao atualizar cobrança');
    }

    return new Response(
      JSON.stringify({ 
        payment_link: paymentLink,
        preference_id: mpData.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('Error in create-mercadopago-payment:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};

serve(handler);
