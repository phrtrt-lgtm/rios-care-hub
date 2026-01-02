import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DebitReserveRequest {
  chargeIds: string[];
  reserveDate?: string;
  ownerValueCents: number;
  baseCommissionPercent: number;
  extraCommissionPercent: number;
  totalCommissionPercent: number;
  ownerReceivesCents: number;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: DebitReserveRequest = await req.json();
    const { 
      chargeIds, 
      reserveDate, 
      ownerValueCents, 
      baseCommissionPercent, 
      extraCommissionPercent, 
      totalCommissionPercent, 
      ownerReceivesCents 
    } = body;

    if (!chargeIds || chargeIds.length === 0) {
      return new Response(
        JSON.stringify({ error: 'chargeIds is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing reserve debit for charges:', chargeIds);
    console.log('Debit details:', { ownerValueCents, baseCommissionPercent, extraCommissionPercent, totalCommissionPercent });

    // Fetch all charges with owner and property
    const { data: charges, error: chargesError } = await supabase
      .from('charges')
      .select(`
        id, 
        owner_id, 
        debited_at, 
        status, 
        title, 
        amount_cents,
        property_id
      `)
      .in('id', chargeIds);

    if (chargesError || !charges || charges.length === 0) {
      console.error('Error fetching charges:', chargesError);
      return new Response(
        JSON.stringify({ error: 'Charges not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter out already debited charges
    const chargesToProcess = charges.filter(c => !c.debited_at);
    if (chargesToProcess.length === 0) {
      console.log('All charges already debited');
      return new Response(
        JSON.stringify({ message: 'All charges already debited' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the owner from the first charge (assuming all charges belong to same owner)
    const ownerId = chargesToProcess[0].owner_id;

    // Get owner profile
    const { data: owner, error: ownerError } = await supabase
      .from('profiles')
      .select('id, name, email, payment_score')
      .eq('id', ownerId)
      .single();

    if (ownerError || !owner) {
      console.error('Error fetching owner:', ownerError);
      return new Response(
        JSON.stringify({ error: 'Owner not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get property name from first charge that has one
    let propertyName = 'Imóvel';
    const chargeWithProperty = chargesToProcess.find(c => c.property_id);
    if (chargeWithProperty?.property_id) {
      const { data: property } = await supabase
        .from('properties')
        .select('name')
        .eq('id', chargeWithProperty.property_id)
        .single();
      if (property) propertyName = property.name;
    }

    const debitedAt = new Date().toISOString();
    const chargeIdsToProcess = chargesToProcess.map(c => c.id);

    // Update all charges with debited_at and reserve details
    const { error: updateError } = await supabase
      .from('charges')
      .update({ 
        debited_at: debitedAt,
        status: 'debited',
        updated_at: debitedAt,
        reserve_debit_date: reserveDate || null,
        reserve_commission_percent: totalCommissionPercent,
        reserve_base_commission_percent: baseCommissionPercent,
        reserve_extra_commission_percent: extraCommissionPercent,
        reserve_owner_value_cents: ownerValueCents,
        reserve_owner_receives_cents: ownerReceivesCents,
      })
      .in('id', chargeIdsToProcess);

    if (updateError) {
      console.error('Error updating charges:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update charges' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`${chargeIdsToProcess.length} charges marked as debited with reserve details`);

    // Calculate total debt amount
    const totalDebtCents = chargesToProcess.reduce((sum, c) => sum + c.amount_cents, 0);

    // Process scores for each charge
    for (const charge of chargesToProcess) {
      const { data: existingScore } = await supabase
        .from('owner_payment_scores')
        .select('id')
        .eq('charge_id', charge.id)
        .single();

      if (!existingScore) {
        const currentScore = owner.payment_score ?? 50;
        const pointsChange = -30;
        const newScore = Math.max(0, Math.min(100, currentScore + pointsChange));

        await supabase
          .from('owner_payment_scores')
          .insert({
            owner_id: ownerId,
            charge_id: charge.id,
            score_before: currentScore,
            score_after: newScore,
            points_change: pointsChange,
            reason: 'reserve_debit',
          });

        // Update profile score
        await supabase
          .from('profiles')
          .update({ payment_score: newScore })
          .eq('id', ownerId);

        // Update owner object for next iteration
        owner.payment_score = newScore;
        console.log(`Score updated for charge ${charge.id}: -> ${newScore}`);
      }
    }

    // Format currency helper
    const formatCurrency = (cents: number) => {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      }).format(cents / 100);
    };

    // Build charge titles for notification
    const chargeTitles = chargesToProcess.map(c => c.title).join(', ');

    // Create notification in the system
    const { error: notifError } = await supabase
      .from('notifications')
      .insert({
        owner_id: ownerId,
        title: 'Débito em Reserva Processado',
        message: `${chargesToProcess.length} cobrança(s) processada(s) via débito em reserva: ${chargeTitles}. Comissão ajustada para ${totalCommissionPercent.toFixed(2).replace('.', ',')}%`,
        type: 'charge',
        reference_id: chargeIdsToProcess[0],
        reference_url: `/minhas-cobrancas`,
      });

    if (notifError) {
      console.error('Error creating notification:', notifError);
    }

    // Send email using template
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const mailFrom = Deno.env.get('MAIL_FROM') || 'onboarding@resend.dev';

    if (resendApiKey && owner.email) {
      try {
        // Fetch email template
        const { data: template } = await supabase
          .from('email_templates')
          .select('subject, body_html')
          .eq('key', 'reserve_debit_notification')
          .single();

        if (template) {
          // Replace variables in template
          let subject = template.subject
            .replace('{{property_name}}', propertyName);

          let bodyHtml = template.body_html
            .replace(/\{\{owner_name\}\}/g, owner.name)
            .replace(/\{\{charge_title\}\}/g, chargeTitles)
            .replace(/\{\{property_name\}\}/g, propertyName)
            .replace(/\{\{owner_value\}\}/g, formatCurrency(ownerValueCents))
            .replace(/\{\{debt_amount\}\}/g, formatCurrency(totalDebtCents))
            .replace(/\{\{owner_receives\}\}/g, formatCurrency(ownerReceivesCents))
            .replace(/\{\{base_commission\}\}/g, baseCommissionPercent.toFixed(0))
            .replace(/\{\{extra_commission\}\}/g, extraCommissionPercent.toFixed(2).replace('.', ','))
            .replace(/\{\{total_commission\}\}/g, totalCommissionPercent.toFixed(2).replace('.', ','))
            .replace(/\{\{portal_url\}\}/g, `${supabaseUrl.replace('.supabase.co', '')}/minhas-cobrancas`);

          // Handle conditional reserve_date
          if (reserveDate) {
            const formattedDate = new Date(reserveDate).toLocaleDateString('pt-BR');
            bodyHtml = bodyHtml
              .replace(/\{\{#if reserve_date\}\}([\s\S]*?)\{\{\/if\}\}/g, '$1')
              .replace(/\{\{reserve_date\}\}/g, formattedDate);
          } else {
            bodyHtml = bodyHtml.replace(/\{\{#if reserve_date\}\}[\s\S]*?\{\{\/if\}\}/g, '');
          }

          const resend = new Resend(resendApiKey);
          await resend.emails.send({
            from: mailFrom,
            to: [owner.email],
            subject: subject,
            html: bodyHtml,
          });

          console.log('Email sent successfully to:', owner.email);
        } else {
          console.log('Email template not found, skipping email');
        }
      } catch (emailError) {
        console.error('Error sending email:', emailError);
      }
    } else {
      console.log('Resend API key not configured or no email, skipping email');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        processedCount: chargeIdsToProcess.length,
        message: `${chargeIdsToProcess.length} cobrança(s) processada(s) e proprietário notificado`,
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
