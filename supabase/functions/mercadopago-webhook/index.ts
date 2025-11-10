import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const mercadoPagoToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    console.log('MercadoPago webhook received:', body);

    // Mercado Pago envia notificações de diferentes tipos
    // Vamos processar apenas notificações de pagamento
    if (body.type === 'payment') {
      const paymentId = body.data?.id;

      if (!paymentId) {
        console.log('No payment ID in webhook');
        return new Response('OK', { status: 200 });
      }

      // Buscar detalhes do pagamento na API do Mercado Pago
      const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          'Authorization': `Bearer ${mercadoPagoToken}`,
        },
      });

      if (!paymentResponse.ok) {
        console.error('Error fetching payment from MercadoPago');
        throw new Error('Erro ao buscar pagamento');
      }

      const payment = await paymentResponse.json();
      console.log('Payment details:', payment);

      const chargeId = payment.external_reference;
      const status = payment.status; // approved, pending, rejected, etc.

      if (!chargeId) {
        console.log('No external_reference in payment');
        return new Response('OK', { status: 200 });
      }

      // Mapear status do Mercado Pago para status da cobrança
      let chargeStatus: string | null = null;
      if (status === 'approved') {
        chargeStatus = 'paid';
      } else if (status === 'rejected' || status === 'cancelled') {
        chargeStatus = 'cancelled';
      }

      // Só atualizar se temos um status válido
      if (!chargeStatus) {
        console.log(`Payment status '${status}' not mapped to charge status, skipping update`);
        return new Response('OK', { status: 200 });
      }

      // Atualizar cobrança
      const updateData: any = {
        status: chargeStatus,
        mercadopago_payment_id: paymentId,
      };

      if (status === 'approved') {
        updateData.paid_at = new Date().toISOString();
      }

      const { error: updateError } = await supabase
        .from('charges')
        .update(updateData)
        .eq('id', chargeId);

      if (updateError) {
        console.error('Error updating charge:', updateError);
        throw new Error('Erro ao atualizar cobrança');
      }

      console.log(`Charge ${chargeId} updated to status: ${chargeStatus}`);

      // Se foi aprovado, enviar notificação
      if (status === 'approved') {
        try {
          await supabase.functions.invoke('notify-charge-message', {
            body: {
              chargeId,
              type: 'payment_received',
            },
          });
        } catch (notifyError) {
          console.error('Error sending notification:', notifyError);
        }
      }
    }

    return new Response('OK', { 
      status: 200,
      headers: corsHeaders,
    });

  } catch (error: any) {
    console.error('Error in mercadopago-webhook:', error);
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
