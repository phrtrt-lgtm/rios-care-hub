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

      // Buscar receipt URL do MercadoPago se o pagamento foi aprovado
      let receiptUrl: string | null = null;
      if (status === 'approved') {
        try {
          const receiptResponse = await fetch(
            `https://api.mercadopago.com/v1/payments/${paymentId}`,
            {
              headers: {
                'Authorization': `Bearer ${mercadoPagoToken}`,
              },
            }
          );
          
          if (receiptResponse.ok) {
            const receiptData = await receiptResponse.json();
            // MercadoPago fornece URL do comprovante em point_of_interaction.transaction_data.ticket_url
            receiptUrl = receiptData.point_of_interaction?.transaction_data?.ticket_url || null;
            console.log('Receipt URL:', receiptUrl);
          }
        } catch (receiptError) {
          console.error('Error fetching receipt:', receiptError);
          // Continuar mesmo se falhar
        }
      }

      // Handle group payment
      if (isGroupPayment && chargeIds.length > 0) {
        console.log('Processing group payment for charges:', chargeIds);

        // Update all charges in the group and create payment records
        const updatePromises = chargeIds.map(async (chargeId: string) => {
          // Buscar informações da charge para calcular o valor correto
          const { data: charge, error: chargeError } = await supabase
            .from('charges')
            .select('amount_cents, owner_id, management_contribution_cents')
            .eq('id', chargeId)
            .single();

          if (chargeError || !charge) {
            console.error(`Error fetching charge ${chargeId}:`, chargeError);
            return;
          }

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

          // Criar registro de pagamento se foi aprovado
          if (status === 'approved') {
            const paymentRecord = {
              charge_id: chargeId,
              amount_cents: charge.amount_cents - (charge.management_contribution_cents || 0),
              payment_date: new Date().toISOString(),
              method: 'mercadopago',
              applies_to: 'total',
              note: `Pagamento MercadoPago ID: ${paymentId}`,
              proof_file_url: receiptUrl,
              created_by: charge.owner_id,
            };

            const { error: paymentError } = await supabase
              .from('charge_payments')
              .insert(paymentRecord);

            if (paymentError) {
              console.error(`Error creating payment record for charge ${chargeId}:`, paymentError);
            } else {
              console.log(`Payment record created for charge ${chargeId}`);
            }
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

      // Buscar informações da charge
      const { data: charge, error: chargeError } = await supabase
        .from('charges')
        .select('amount_cents, owner_id, management_contribution_cents')
        .eq('id', chargeId)
        .single();

      if (chargeError || !charge) {
        console.error('Error fetching charge:', chargeError);
        throw new Error('Erro ao buscar cobrança');
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

      // Criar registro de pagamento se foi aprovado
      if (status === 'approved') {
        const paymentRecord = {
          charge_id: chargeId,
          amount_cents: charge.amount_cents - (charge.management_contribution_cents || 0),
          payment_date: new Date().toISOString(),
          method: 'mercadopago',
          applies_to: 'total',
          note: `Pagamento MercadoPago ID: ${paymentId}`,
          proof_file_url: receiptUrl,
          created_by: charge.owner_id,
        };

        const { error: paymentError } = await supabase
          .from('charge_payments')
          .insert(paymentRecord);

        if (paymentError) {
          console.error('Error creating payment record:', paymentError);
        } else {
          console.log('Payment record created successfully');
        }

        // Enviar notificação de pagamento confirmado
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
