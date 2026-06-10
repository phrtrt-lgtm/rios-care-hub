import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReservationItem {
  date: string;
  owner_value_cents: number;
  owner_receives_cents: number;
  coverage_cents: number;
}

interface DebitReserveRequest {
  chargeIds: string[];
  reserveDate: string;
  ownerValueCents: number;
  baseCommissionPercent: number;
  extraCommissionPercent: number;
  extraCommissionPercentExact?: number;
  totalCommissionPercent: number;
  ownerReceivesCents: number;
  reservations?: ReservationItem[];
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
      extraCommissionPercentExact,
      totalCommissionPercent, 
      ownerReceivesCents,
      reservations,
    } = body;

    const reservationList: ReservationItem[] = reservations && reservations.length > 0
      ? reservations
      : [{
          date: reserveDate,
          owner_value_cents: ownerValueCents,
          owner_receives_cents: ownerReceivesCents,
          coverage_cents: ownerValueCents - ownerReceivesCents,
        }];

    if (!chargeIds || chargeIds.length === 0) {
      return new Response(
        JSON.stringify({ error: 'chargeIds is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!reserveDate) {
      return new Response(
        JSON.stringify({ error: 'reserveDate (check-in date) is required' }),
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
        management_contribution_cents,
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

    // Update all charges with reserve details - status aguardando_reserva (standby)
    const { error: updateError } = await supabase
      .from('charges')
      .update({ 
        status: 'aguardando_reserva',
        updated_at: debitedAt,
        reserve_debit_date: reservationList[0].date,
        reserve_commission_percent: totalCommissionPercent,
        reserve_base_commission_percent: baseCommissionPercent,
        reserve_extra_commission_percent: extraCommissionPercent,
        reserve_owner_value_cents: ownerValueCents,
        reserve_owner_receives_cents: ownerReceivesCents,
        reserve_reservations: reservationList,
      })
      .in('id', chargeIdsToProcess);

    if (updateError) {
      console.error('Error updating charges:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update charges' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`${chargeIdsToProcess.length} charges set to aguardando_reserva with check-in date: ${reserveDate}`);

    // Calculate total debt amount: only owner's portion (amount minus management contribution)
    const totalDebtCents = chargesToProcess.reduce((sum, c) => {
      const managementContribution = (c as any).management_contribution_cents ?? 0;
      return sum + Math.max(0, c.amount_cents - managementContribution);
    }, 0);

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

    const formattedCheckIn = new Date(reservationList[0].date).toLocaleDateString('pt-BR');

    // Build reservations HTML table for email
    const reservationsTableHtml = `
      <div style="margin:24px 0;padding:16px;background:#f8f9fa;border-radius:8px;border:1px solid #e5e7eb">
        <h3 style="margin:0 0 12px;color:#1a1a1a;font-size:15px">Reservas utilizadas para cobrir o débito (${reservationList.length})</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#eef2ff;color:#1a1a1a">
              <th style="padding:8px;text-align:left;border-bottom:1px solid #d1d5db">Check-in</th>
              <th style="padding:8px;text-align:right;border-bottom:1px solid #d1d5db">Valor original</th>
              <th style="padding:8px;text-align:right;border-bottom:1px solid #d1d5db">Cobre da dívida</th>
              <th style="padding:8px;text-align:right;border-bottom:1px solid #d1d5db">Receberá</th>
            </tr>
          </thead>
          <tbody>
            ${reservationList.map(r => `
              <tr>
                <td style="padding:8px;border-bottom:1px solid #f1f5f9">${new Date(r.date).toLocaleDateString('pt-BR')}</td>
                <td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9">${formatCurrency(r.owner_value_cents)}</td>
                <td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9;color:#b91c1c">- ${formatCurrency(r.coverage_cents)}</td>
                <td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9"><strong>${formatCurrency(r.owner_receives_cents)}</strong></td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:600;background:#f1f5f9">
              <td style="padding:8px">Total</td>
              <td style="padding:8px;text-align:right">${formatCurrency(ownerValueCents)}</td>
              <td style="padding:8px;text-align:right;color:#b91c1c">- ${formatCurrency(ownerValueCents - ownerReceivesCents)}</td>
              <td style="padding:8px;text-align:right">${formatCurrency(ownerReceivesCents)}</td>
            </tr>
          </tfoot>
        </table>
        <p style="margin:12px 0 0;font-size:12px;color:#6b7280">Comissão única configurada em todas as reservas: <strong>${totalCommissionPercent.toFixed(0)}%</strong> (base ${baseCommissionPercent.toFixed(0)}% + ${extraCommissionPercent}% extra)</p>
      </div>
    `;
    
    // Create notification in the system
    const { error: notifError } = await supabase
      .from('notifications')
      .insert({
        owner_id: ownerId,
        title: 'Débito em Reserva Agendado',
        message: `${chargesToProcess.length} cobrança(s) agendada(s) para débito na reserva de ${formattedCheckIn}. Comissão: ${totalCommissionPercent.toFixed(0)}% (${extraCommissionPercent}% extra)`,
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
            .replace(/\{\{extra_commission\}\}/g, extraCommissionPercent.toFixed(0))
            .replace(/\{\{extra_commission_exact\}\}/g, (extraCommissionPercentExact ?? extraCommissionPercent).toFixed(2).replace('.', ','))
            .replace(/\{\{total_commission\}\}/g, totalCommissionPercent.toFixed(0))
            .replace(/\{\{checkin_date\}\}/g, formattedCheckIn)
            .replace(/\{\{portal_url\}\}/g, `${supabaseUrl.replace('.supabase.co', '')}/minhas-cobrancas`);

          // Replace reserve_date with checkin_date
          bodyHtml = bodyHtml
            .replace(/\{\{#if reserve_date\}\}([\s\S]*?)\{\{\/if\}\}/g, '$1')
            .replace(/\{\{reserve_date\}\}/g, formattedCheckIn);

          // Inject reservations table (replace placeholder if present, else append before </body>)
          if (bodyHtml.includes('{{reservations_table}}')) {
            bodyHtml = bodyHtml.replace(/\{\{reservations_table\}\}/g, reservationsTableHtml);
          } else if (bodyHtml.includes('</body>')) {
            bodyHtml = bodyHtml.replace('</body>', `${reservationsTableHtml}</body>`);
          } else {
            bodyHtml = `${bodyHtml}${reservationsTableHtml}`;
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
