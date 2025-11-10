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

      const externalRef = payment.external_reference;
      const status = payment.status; // approved, pending, rejected, etc.
      const isGroupPayment = payment.metadata?.is_group_payment === true;
      const chargeIds = payment.metadata?.charge_ids || [];

      if (!externalRef) {
        console.log('No external_reference in payment');
        return new Response('OK', { status: 200 });
      }

      console.log('Processing payment:', paymentId, 'Status:', status);
      console.log('Is group payment:', isGroupPayment);
      console.log('Charge IDs from metadata:', chargeIds);

      // Mapear status do Mercado Pago
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

      // Handle group payment
      if (isGroupPayment && chargeIds.length > 0) {
        console.log('Processing group payment for charges:', chargeIds);

        // Update all charges in the group
        const updatePromises = chargeIds.map(async (chargeId: string) => {
          const updateData: any = {
            status: chargeStatus,
            updated_at: new Date().toISOString(),
          };

          if (status === 'approved') {
            updateData.paid_at = new Date().toISOString();
          }

          const { error: updateError } = await supabase
            .from('charges')
            .update(updateData)
            .eq('id', chargeId);

          if (updateError) {
            console.error(`Error updating charge ${chargeId}:`, updateError);
          } else {
            console.log(`Charge ${chargeId} updated to status:`, chargeStatus);
          }
        });

        await Promise.all(updatePromises);
        console.log('All charges in group payment updated');
        
        // Send payment confirmation email for each charge
        if (status === 'approved') {
          const emailPromises = chargeIds.map(async (chargeId: string) => {
            try {
              await supabase.functions.invoke('send-charge-email', {
                body: {
                  chargeId,
                  type: 'charge_paid',
                },
              });
            } catch (emailError) {
              console.error(`Error sending email for charge ${chargeId}:`, emailError);
            }
          });
          await Promise.all(emailPromises);
        }
        
        return new Response('OK', { status: 200 });
      }

      // Single charge payment (existing logic)
      const chargeId = externalRef;

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

      // Se foi aprovado, enviar notificação de pagamento confirmado
      if (status === 'approved') {
        try {
          await supabase.functions.invoke('send-charge-email', {
            body: {
              chargeId,
              type: 'charge_paid',
            },
          });
        } catch (notifyError) {
          console.error('Error sending payment confirmation:', notifyError);
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
