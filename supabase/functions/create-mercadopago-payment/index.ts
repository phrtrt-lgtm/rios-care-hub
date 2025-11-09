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
          name,
          profiles (
            name,
            email,
            phone
          )
        )
      `)
      .eq('id', chargeId)
      .single();

    if (chargeError || !charge) {
      console.error('Charge not found:', chargeError);
      throw new Error('Cobrança não encontrada');
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
    const owner = property?.profiles;

    // Calcular valor total (valor devido + contribuição da gestão)
    const totalAmount = charge.due_amount + (charge.management_contribution || 0);

    // Criar preferência de pagamento no Mercado Pago
    const preferencePayload = {
      items: [
        {
          title: charge.title || 'Cobrança de Manutenção',
          description: charge.description || '',
          quantity: 1,
          currency_id: 'BRL',
          unit_price: totalAmount,
        }
      ],
      payer: {
        name: owner?.name || '',
        email: owner?.email || '',
        phone: {
          area_code: owner?.phone?.substring(0, 2) || '',
          number: owner?.phone?.substring(2) || '',
        }
      },
      back_urls: {
        success: `${Deno.env.get('SUPABASE_URL')?.replace('supabase.co', 'lovable.app')}/minhas-cobrancas`,
        failure: `${Deno.env.get('SUPABASE_URL')?.replace('supabase.co', 'lovable.app')}/minhas-cobrancas`,
        pending: `${Deno.env.get('SUPABASE_URL')?.replace('supabase.co', 'lovable.app')}/minhas-cobrancas`,
      },
      auto_return: 'approved',
      external_reference: chargeId,
      notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
      statement_descriptor: 'MANUTENCAO',
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

    // Atualizar cobrança com o link de pagamento
    const { error: updateError } = await supabase
      .from('charges')
      .update({ 
        payment_link: paymentLink,
        mercadopago_preference_id: mpData.id,
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
