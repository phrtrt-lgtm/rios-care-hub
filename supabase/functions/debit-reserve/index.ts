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
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { chargeId } = await req.json();

    if (!chargeId) {
      return new Response(
        JSON.stringify({ error: 'chargeId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing reserve debit for charge:', chargeId);

    // Fetch charge details
    const { data: charge, error: chargeError } = await supabase
      .from('charges')
      .select('id, owner_id, debited_at, status')
      .eq('id', chargeId)
      .single();

    if (chargeError || !charge) {
      console.error('Error fetching charge:', chargeError);
      return new Response(
        JSON.stringify({ error: 'Charge not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if already debited
    if (charge.debited_at) {
      console.log('Charge already debited, skipping');
      return new Response(
        JSON.stringify({ message: 'Charge already debited' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const debitedAt = new Date().toISOString();

    // Update charge with debited_at
    const { error: updateError } = await supabase
      .from('charges')
      .update({ 
        debited_at: debitedAt,
        status: 'debited',
        updated_at: debitedAt,
      })
      .eq('id', chargeId);

    if (updateError) {
      console.error('Error updating charge:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update charge' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Charge marked as debited');

    // Check if score already recorded for this charge
    const { data: existingScore } = await supabase
      .from('owner_payment_scores')
      .select('id')
      .eq('charge_id', chargeId)
      .single();

    if (existingScore) {
      console.log('Score already recorded for this charge, skipping score update');
      return new Response(
        JSON.stringify({ success: true, message: 'Charge debited, score already recorded' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get current owner score
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('payment_score')
      .eq('id', charge.owner_id)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch owner profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const currentScore = profile?.payment_score ?? 50;
    const pointsChange = -30;
    const newScore = Math.max(0, Math.min(100, currentScore + pointsChange));

    // Record score history
    const { error: historyError } = await supabase
      .from('owner_payment_scores')
      .insert({
        owner_id: charge.owner_id,
        charge_id: chargeId,
        score_before: currentScore,
        score_after: newScore,
        points_change: pointsChange,
        reason: 'reserve_debit',
      });

    if (historyError) {
      console.error('Error recording score history:', historyError);
    }

    // Update profile score
    const { error: scoreUpdateError } = await supabase
      .from('profiles')
      .update({ payment_score: newScore })
      .eq('id', charge.owner_id);

    if (scoreUpdateError) {
      console.error('Error updating profile score:', scoreUpdateError);
    }

    console.log(`Score updated: ${currentScore} -> ${newScore} (reserve_debit)`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        scoreChange: pointsChange,
        newScore,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in debit-reserve:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
