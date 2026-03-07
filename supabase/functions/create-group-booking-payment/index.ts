import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { v4 as uuidv4 } from 'https://esm.sh/uuid@9.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const mercadoPagoToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Não autorizado');
    }

    const { commissionIds }: { commissionIds: string[] } = await req.json();

    if (!commissionIds || commissionIds.length === 0) {
      throw new Error('Nenhuma comissão selecionada');
    }

    console.log('Creating group booking payment for commissions:', commissionIds);

    // Fetch all selected commissions
    const { data: commissions, error: commissionsError } = await supabase
      .from('booking_commissions')
      .select('id, guest_name, total_due_cents, status, owner_id, property:property_id(name)')
      .in('id', commissionIds)
      .eq('owner_id', user.id);

    if (commissionsError) throw commissionsError;

    if (!commissions || commissions.length === 0) {
      throw new Error('Comissões não encontradas');
    }

    // Validate all commissions are open
    const invalidCommissions = commissions.filter(
      c => !['sent', 'overdue', 'pendente'].includes(c.status)
    );
    if (invalidCommissions.length > 0) {
      throw new Error('Algumas comissões selecionadas não estão em aberto');
    }

    // Get owner info
    const { data: owner, error: ownerError } = await supabase
      .from('profiles')
      .select('name, email')
      .eq('id', user.id)
      .single();

    if (ownerError) throw ownerError;

    // Calculate total
    const totalCents = commissions.reduce((sum, c) => sum + c.total_due_cents, 0);

    if (totalCents <= 0) {
      throw new Error('Valor total inválido');
    }

    const shortReference = `gbkg_${commissionIds[0].substring(0, 8)}_${Date.now()}`;

    // Create PIX payment
    const pixPaymentData = {
      transaction_amount: totalCents / 100,
      description: `Comissões Booking – ${commissions.length} reserva${commissions.length > 1 ? 's' : ''}`,
      payment_method_id: 'pix',
      payer: {
        email: owner.email,
        first_name: owner.name,
      },
      metadata: {
        commission_ids: commissionIds,
        is_group_booking_payment: true,
      },
      external_reference: shortReference,
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
      console.error('PIX payment failed:', errorText);
      throw new Error(`Erro ao gerar PIX: ${errorText}`);
    }

    const pixPayment = await pixResponse.json();
    console.log('PIX payment created:', pixPayment.id);

    const qrCode = pixPayment.point_of_interaction?.transaction_data?.qr_code || '';
    const qrCodeBase64 = pixPayment.point_of_interaction?.transaction_data?.qr_code_base64 || '';

    return new Response(
      JSON.stringify({
        pix_qr_code: qrCode,
        pix_qr_code_base64: qrCodeBase64 ? `data:image/png;base64,${qrCodeBase64}` : '',
        total_amount: totalCents,
        commission_ids: commissionIds,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in create-group-booking-payment:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
