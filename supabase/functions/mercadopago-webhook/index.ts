import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Calculate score change based on payment timing
async function updateOwnerScore(
  supabase: any,
  ownerId: string,
  chargeId: string,
  dueDate: string | null,
  paidAt: string
) {
  if (!dueDate) {
    console.log('No due date for charge, skipping score update');
    return;
  }

  const paidDate = new Date(paidAt);
  const dueDateObj = new Date(dueDate);
  const diffDays = Math.floor((dueDateObj.getTime() - paidDate.getTime()) / (1000 * 60 * 60 * 24));

  let reason: string;
  let pointsChange: number;

  if (diffDays >= 2) {
    // Paid 2+ days early
    reason = 'early_payment';
    pointsChange = 5;
  } else if (diffDays >= 0) {
    // Paid on time (0-1 days before due)
    reason = 'on_time_payment';
    pointsChange = 1;
  } else {
    // Paid late (after due date)
    reason = 'late_payment';
    pointsChange = -15;
  }

  console.log(`Score update: ${reason}, points: ${pointsChange}, diffDays: ${diffDays}`);

  // Get current score
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('payment_score')
    .eq('id', ownerId)
    .single();

  if (profileError) {
    console.error('Error fetching profile for score:', profileError);
    return;
  }

  const currentScore = profile?.payment_score ?? 50;
  const newScore = Math.max(0, Math.min(100, currentScore + pointsChange));

  // Check if score already recorded for this charge
  const { data: existingScore } = await supabase
    .from('owner_payment_scores')
    .select('id')
    .eq('charge_id', chargeId)
    .single();

  if (existingScore) {
    console.log('Score already recorded for this charge, skipping');
    return;
  }

  // Record score history
  const { error: historyError } = await supabase
    .from('owner_payment_scores')
    .insert({
      owner_id: ownerId,
      charge_id: chargeId,
      score_before: currentScore,
      score_after: newScore,
      points_change: pointsChange,
      reason,
    });

  if (historyError) {
    console.error('Error recording score history:', historyError);
    return;
  }

  // Update profile score
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ payment_score: newScore })
    .eq('id', ownerId);

  if (updateError) {
    console.error('Error updating profile score:', updateError);
    return;
  }

  console.log(`Score updated: ${currentScore} -> ${newScore} (${reason})`);
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
      const isProposalPayment = payment.metadata?.type === 'proposal_payment';
      const proposalId = payment.metadata?.proposal_id;
      const proposalOwnerId = payment.metadata?.owner_id;
      // Group booking commission payment
      const isGroupBookingPayment = payment.metadata?.is_group_booking_payment === true;
      const commissionIds: string[] = payment.metadata?.commission_ids || [];

      if (!externalRef) {
        console.log('No external_reference in payment');
        return new Response('OK', { status: 200 });
      }

      console.log('Processing payment:', paymentId, 'Status:', status);
      console.log('Is group payment:', isGroupPayment);
      console.log('Is group booking payment:', isGroupBookingPayment);
      console.log('Is proposal payment:', isProposalPayment);
      console.log('Charge IDs from metadata:', chargeIds);
      console.log('Commission IDs from metadata:', commissionIds);

      // Mapear status do Mercado Pago para status de cobrança
      // O status final de pagamento será determinado pela data
      let baseChargeStatus: string | null = null;
      let isPaymentExpired = false;
      
      if (status === 'approved') {
        baseChargeStatus = 'approved'; // Will be refined based on due date later
      } else if (status === 'rejected') {
        // Only rejected payments should mark as cancelled, not expired ones
        baseChargeStatus = 'cancelled';
      } else if (status === 'cancelled') {
        // Check if it's an expiration (PIX expired) vs actual cancellation
        // Expired PIX payments have status_detail = 'expired'
        if (payment.status_detail === 'expired') {
          isPaymentExpired = true;
          baseChargeStatus = 'sent'; // Reset to sent so owner can pay again
          console.log('Payment expired (PIX timeout), resetting charge status to sent');
        } else {
          // Actual cancellation - don't change charge status, just clear payment data
          console.log('Payment cancelled by user, clearing payment data');
          isPaymentExpired = true;
          baseChargeStatus = 'sent';
        }
      }

      // Só atualizar se temos um status válido
      if (!baseChargeStatus) {
        console.log(`Payment status '${status}' not mapped to charge status, skipping update`);
        return new Response('OK', { status: 200 });
      }

      // Helper function to determine final charge status based on payment timing
      const getPaymentStatus = (dueDate: string | null, paidAt: string): string => {
        if (!dueDate) return 'pago_no_vencimento'; // Default if no due date
        
        const paidDate = new Date(paidAt);
        const dueDateObj = new Date(dueDate);
        const diffDays = Math.floor((dueDateObj.getTime() - paidDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diffDays >= 2) {
          return 'pago_antecipado'; // Paid 2+ days early
        } else if (diffDays >= 0) {
          return 'pago_no_vencimento'; // Paid on time
        } else {
          return 'pago_com_atraso'; // Paid late
        }
      };

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

      const paidAt = new Date().toISOString();

      // Handle proposal payment
      if (isProposalPayment && proposalId && proposalOwnerId) {
        console.log('Processing proposal payment for:', proposalId, 'owner:', proposalOwnerId);

        if (status === 'approved') {
          // Update proposal_response with payment info
          const { error: updateError } = await supabase
            .from('proposal_responses')
            .update({
              paid_at: paidAt,
              payment_amount_cents: Math.round(payment.transaction_amount * 100),
              mercadopago_payment_id: String(paymentId),
              payment_status: 'approved',
            })
            .eq('proposal_id', proposalId)
            .eq('owner_id', proposalOwnerId);

          if (updateError) {
            console.error('Error updating proposal response payment:', updateError);
          } else {
            console.log('Proposal response payment recorded successfully');
          }

          // Create notification for team about payment received
          try {
            // Fetch proposal title
            const { data: proposal } = await supabase
              .from('proposals')
              .select('title')
              .eq('id', proposalId)
              .single();

            // Fetch owner name
            const { data: owner } = await supabase
              .from('profiles')
              .select('name')
              .eq('id', proposalOwnerId)
              .single();

            // Notify all admin users
            const { data: admins } = await supabase
              .from('profiles')
              .select('id')
              .eq('role', 'admin');

            if (admins && admins.length > 0) {
              const notifications = admins.map((admin: any) => ({
                owner_id: admin.id,
                title: '💰 Pagamento de Proposta Recebido',
                message: `${owner?.name || 'Proprietário'} pagou R$ ${payment.transaction_amount.toFixed(2)} da proposta: ${proposal?.title || 'Proposta'}`,
                type: 'proposal_payment',
                reference_id: proposalId,
                reference_url: `/votacao-detalhes/${proposalId}`,
              }));

              await supabase.from('notifications').insert(notifications);
            }
          } catch (notifyError) {
            console.error('Error sending proposal payment notification:', notifyError);
          }
        }

        return new Response('OK', { status: 200 });
      }

      // Handle group payment
      if (isGroupPayment && chargeIds.length > 0) {
        console.log('Processing group payment for charges:', chargeIds);

        // Update all charges in the group and create payment records
        const updatePromises = chargeIds.map(async (chargeId: string) => {
          // Buscar informações da charge para calcular o valor correto
          const { data: charge, error: chargeError } = await supabase
            .from('charges')
            .select('amount_cents, owner_id, management_contribution_cents, due_date')
            .eq('id', chargeId)
            .single();

          if (chargeError || !charge) {
            console.error(`Error fetching charge ${chargeId}:`, chargeError);
            return;
          }

          // Determine the correct payment status based on timing
          const chargeStatus = status === 'approved' 
            ? getPaymentStatus(charge.due_date, paidAt)
            : baseChargeStatus;

          const updateData: any = {
            status: chargeStatus,
            updated_at: new Date().toISOString(),
          };

          if (status === 'approved') {
            updateData.paid_at = paidAt;
          }
          
          // If payment expired, clear the payment data so a new payment can be generated
          if (isPaymentExpired) {
            updateData.mercadopago_preference_id = null;
            updateData.mercadopago_payment_id = null;
            updateData.pix_qr_code = null;
            updateData.pix_qr_code_base64 = null;
            updateData.payment_link_url = null;
          }

          const { error: updateError } = await supabase
            .from('charges')
            .update(updateData)
            .eq('id', chargeId);

          if (updateError) {
            console.error(`Error updating charge ${chargeId}:`, updateError);
          } else {
            console.log(`Charge ${chargeId} updated to status: ${chargeStatus}${isPaymentExpired ? ' (payment data cleared)' : ''}`);
          }

          // Criar registro de pagamento se foi aprovado
          if (status === 'approved') {
            // Check if payment record already exists to avoid duplicates
            const { data: existingPayment } = await supabase
              .from('charge_payments')
              .select('id')
              .eq('charge_id', chargeId)
              .eq('method', 'mercadopago')
              .maybeSingle();

            if (!existingPayment) {
              const paymentRecord = {
                charge_id: chargeId,
                amount_cents: charge.amount_cents - (charge.management_contribution_cents || 0),
                payment_date: paidAt,
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
            } else {
              console.log(`Payment record already exists for charge ${chargeId}, skipping insert`);
              // Ensure charge status is updated even if payment record already exists
              const currentChargeStatus = status === 'approved'
                ? getPaymentStatus(charge.due_date, paidAt)
                : baseChargeStatus;
              await supabase
                .from('charges')
                .update({ status: currentChargeStatus, paid_at: paidAt, updated_at: new Date().toISOString() })
                .eq('id', chargeId)
                .in('status', ['sent', 'pendente', 'overdue']); // only update if still unpaid
              console.log(`Ensured charge ${chargeId} status updated to ${currentChargeStatus}`);
            }

            // Update owner score
            await updateOwnerScore(supabase, charge.owner_id, chargeId, charge.due_date, paidAt);
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
        .select('amount_cents, owner_id, management_contribution_cents, due_date')
        .eq('id', chargeId)
        .single();

      if (chargeError || !charge) {
        console.error('Error fetching charge:', chargeError);
        throw new Error('Erro ao buscar cobrança');
      }

      // Determine the correct payment status based on timing
      const chargeStatus = status === 'approved' 
        ? getPaymentStatus(charge.due_date, paidAt)
        : baseChargeStatus;

      // Atualizar cobrança
      const updateData: any = {
        status: chargeStatus,
        mercadopago_payment_id: paymentId,
      };

      if (status === 'approved') {
        updateData.paid_at = paidAt;
      }
      
      // If payment expired, clear the payment data so a new payment can be generated
      if (isPaymentExpired) {
        updateData.mercadopago_preference_id = null;
        updateData.mercadopago_payment_id = null;
        updateData.pix_qr_code = null;
        updateData.pix_qr_code_base64 = null;
        updateData.payment_link_url = null;
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
          payment_date: paidAt,
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

        // Update owner score
        await updateOwnerScore(supabase, charge.owner_id, chargeId, charge.due_date, paidAt);

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
