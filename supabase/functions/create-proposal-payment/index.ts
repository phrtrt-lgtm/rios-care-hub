import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreatePaymentRequest {
  proposalId: string;
  quantity?: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const mercadopagoToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');

    if (!mercadopagoToken) {
      throw new Error('Mercado Pago not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { proposalId, quantity } = await req.json() as CreatePaymentRequest;

    if (!proposalId) {
      return new Response(
        JSON.stringify({ error: 'proposalId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Creating payment for proposal:', proposalId, 'user:', user.id, 'quantity:', quantity);

    // Fetch proposal details
    const { data: proposal, error: proposalError } = await supabase
      .from('proposals')
      .select('*')
      .eq('id', proposalId)
      .single();

    if (proposalError || !proposal) {
      console.error('Proposal not found:', proposalError);
      return new Response(
        JSON.stringify({ error: 'Proposal not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate amount based on payment_type
    let amountCents = 0;
    const paymentType = proposal.payment_type || 'none';
    
    if (paymentType === 'fixed') {
      amountCents = proposal.amount_cents || 0;
    } else if (paymentType === 'quantity') {
      const unitPrice = proposal.unit_price_cents || 0;
      const qty = quantity || 1;
      amountCents = unitPrice * qty;
    }

    if (amountCents <= 0) {
      return new Response(
        JSON.stringify({ error: 'Proposal has no payment amount' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get owner profile
    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('name, email')
      .eq('id', user.id)
      .single();

    const amountBRL = amountCents / 100;

    // Create Mercado Pago preference
    const itemTitle = paymentType === 'quantity' 
      ? `${proposal.title} (x${quantity || 1})` 
      : proposal.title;

    const preferencePayload = {
      items: [
        {
          id: proposalId,
          title: `Proposta: ${itemTitle}`,
          description: proposal.description?.substring(0, 200) || proposal.title,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: amountBRL,
        },
      ],
      payer: {
        name: ownerProfile?.name || 'Proprietário',
        email: ownerProfile?.email || user.email,
      },
      payment_methods: {
        excluded_payment_types: [],
        installments: 12,
      },
      back_urls: {
        success: `${supabaseUrl.replace('.supabase.co', '')}/votacoes`,
        failure: `${supabaseUrl.replace('.supabase.co', '')}/votacao-detalhes/${proposalId}`,
        pending: `${supabaseUrl.replace('.supabase.co', '')}/votacao-detalhes/${proposalId}`,
      },
      auto_return: 'approved',
      external_reference: `proposal_${proposalId}_${user.id}`,
      metadata: {
        proposal_id: proposalId,
        owner_id: user.id,
        type: 'proposal_payment',
      },
    };

    console.log('Creating Mercado Pago preference...');

    const preferenceResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mercadopagoToken}`,
      },
      body: JSON.stringify(preferencePayload),
    });

    if (!preferenceResponse.ok) {
      const errorText = await preferenceResponse.text();
      console.error('Mercado Pago preference error:', errorText);
      throw new Error('Failed to create payment preference');
    }

    const preferenceData = await preferenceResponse.json();
    console.log('Preference created:', preferenceData.id);

    // Create PIX payment for QR code
    let pixData = null;
    try {
      const pixPayload = {
        transaction_amount: amountBRL,
        description: `Proposta: ${proposal.title}`,
        payment_method_id: 'pix',
        payer: {
          email: ownerProfile?.email || user.email,
          first_name: ownerProfile?.name?.split(' ')[0] || 'Proprietário',
          last_name: ownerProfile?.name?.split(' ').slice(1).join(' ') || '',
        },
        external_reference: `proposal_${proposalId}_${user.id}`,
        metadata: {
          proposal_id: proposalId,
          owner_id: user.id,
          type: 'proposal_payment',
        },
      };

      const idempotencyKey = `proposal-${proposalId}-${user.id}-${Date.now()}`;

      const pixResponse = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mercadopagoToken}`,
          'X-Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(pixPayload),
      });

      if (pixResponse.ok) {
        const pixResult = await pixResponse.json();
        console.log('PIX payment created:', pixResult.id);
        
        pixData = {
          pixQrCode: pixResult.point_of_interaction?.transaction_data?.qr_code,
          pixQrCodeBase64: pixResult.point_of_interaction?.transaction_data?.qr_code_base64,
        };
      } else {
        const pixError = await pixResponse.text();
        console.error('PIX creation failed:', pixError);
      }
    } catch (pixError) {
      console.error('PIX creation error:', pixError);
    }

    return new Response(
      JSON.stringify({
        paymentLink: preferenceData.init_point,
        preferenceId: preferenceData.id,
        ...pixData,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error creating proposal payment:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
