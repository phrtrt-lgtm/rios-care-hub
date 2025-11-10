import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { v4 as uuidv4 } from 'https://esm.sh/uuid@9.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateGroupPaymentRequest {
  chargeIds: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const mercadoPagoToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get auth token
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Não autorizado');
    }

    const { chargeIds }: CreateGroupPaymentRequest = await req.json();

    if (!chargeIds || chargeIds.length === 0) {
      throw new Error('Nenhuma cobrança selecionada');
    }

    console.log('Creating group payment for charges:', chargeIds);

    // Fetch all selected charges
    const { data: charges, error: chargesError } = await supabase
      .from('charges')
      .select('id, title, amount_cents, management_contribution_cents, status, owner_id')
      .in('id', chargeIds)
      .eq('owner_id', user.id);

    if (chargesError) {
      console.error('Error fetching charges:', chargesError);
      throw chargesError;
    }

    if (!charges || charges.length === 0) {
      throw new Error('Cobranças não encontradas');
    }

    // Validate all charges are open
    const invalidCharges = charges.filter(c => c.status !== 'sent' && c.status !== 'overdue');
    if (invalidCharges.length > 0) {
      throw new Error('Algumas cobranças selecionadas não estão em aberto');
    }

    // Get owner info
    const { data: owner, error: ownerError } = await supabase
      .from('profiles')
      .select('name, email')
      .eq('id', user.id)
      .single();

    if (ownerError) {
      console.error('Error fetching owner:', ownerError);
      throw ownerError;
    }

    // Calculate total due amount for all charges
    const totalDueAmountCents = charges.reduce((sum, charge) => {
      const dueAmount = charge.amount_cents - (charge.management_contribution_cents || 0);
      return sum + dueAmount;
    }, 0);

    console.log('Total due amount (cents):', totalDueAmountCents);

    if (totalDueAmountCents <= 0) {
      throw new Error('Valor total inválido');
    }

    // Create Mercado Pago preference
    const chargesTitles = charges.map(c => c.title).join(', ');
    const preferenceData = {
      items: [
        {
          title: `Pagamento Agrupado - ${charges.length} cobrança${charges.length > 1 ? 's' : ''}`,
          description: chargesTitles.substring(0, 250),
          quantity: 1,
          unit_price: totalDueAmountCents / 100,
          currency_id: 'BRL',
        },
      ],
      payer: {
        name: owner.name,
        email: owner.email,
      },
      metadata: {
        charge_ids: chargeIds,
        is_group_payment: true,
      },
      external_reference: `group_${chargeIds.join('_')}`,
      notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
    };

    console.log('Creating Mercado Pago preference:', JSON.stringify(preferenceData, null, 2));

    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mercadoPagoToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preferenceData),
    });

    if (!mpResponse.ok) {
      const errorText = await mpResponse.text();
      console.error('Mercado Pago preference error:', errorText);
      throw new Error(`Erro ao criar preferência: ${errorText}`);
    }

    const preference = await mpResponse.json();
    console.log('Mercado Pago preference created:', preference.id);

    // Create PIX payment
    const pixPaymentData = {
      transaction_amount: totalDueAmountCents / 100,
      description: `Pagamento Agrupado - ${charges.length} cobrança${charges.length > 1 ? 's' : ''}`,
      payment_method_id: 'pix',
      payer: {
        email: owner.email,
        first_name: owner.name,
      },
      metadata: {
        charge_ids: chargeIds,
        is_group_payment: true,
      },
      external_reference: `group_${chargeIds.join('_')}`,
      notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
    };

    console.log('Creating PIX payment:', JSON.stringify(pixPaymentData, null, 2));

    const idempotencyKey = uuidv4();
    const pixResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mercadoPagoToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(pixPaymentData),
    });

    if (!pixResponse.ok) {
      const errorText = await pixResponse.text();
      console.error('PIX payment error:', errorText);
      throw new Error(`Erro ao criar pagamento PIX: ${errorText}`);
    }

    const pixPayment = await pixResponse.json();
    console.log('PIX payment created:', pixPayment.id);

    const qrCode = pixPayment.point_of_interaction?.transaction_data?.qr_code || '';
    const qrCodeBase64 = pixPayment.point_of_interaction?.transaction_data?.qr_code_base64 || '';

    console.log('Group payment created successfully');
    console.log('QR Code length:', qrCode.length);
    console.log('QR Code Base64 available:', !!qrCodeBase64);

    return new Response(
      JSON.stringify({
        payment_link: preference.init_point,
        preference_id: preference.id,
        pix_qr_code: qrCode,
        pix_qr_code_base64: `data:image/png;base64,${qrCodeBase64}`,
        total_amount: totalDueAmountCents,
        charge_ids: chargeIds,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in create-group-payment:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    const errorDetails = error instanceof Error ? error.toString() : String(error);
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: errorDetails
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
