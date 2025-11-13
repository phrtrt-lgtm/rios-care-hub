import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { renderTemplate, getTemplate } from "../_shared/template-renderer.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Checking for proposals with upcoming deadlines...');

    // Get proposals expiring in 2 days that are still active
    const twoDaysFromNow = new Date();
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
    const twoDaysStr = twoDaysFromNow.toISOString().split('T')[0];

    const { data: proposals, error: proposalsError } = await supabase
      .from('proposals')
      .select('*')
      .eq('status', 'active')
      .eq('deadline', twoDaysStr);

    if (proposalsError) {
      throw proposalsError;
    }

    console.log('Found proposals:', proposals?.length || 0);

    const template = await getTemplate(supabase, 'proposal_deadline_reminder');
    if (!template) {
      throw new Error('Email template not found');
    }

    const mailFrom = Deno.env.get('MAIL_FROM') || 'noreply@resend.dev';
    const portalUrl = Deno.env.get("PORTAL_URL") || "https://portal.rioshospedagens.com.br";
    let totalSent = 0;

    for (const proposal of proposals || []) {
      // Get owners who haven't responded yet (no selected_option_id)
      const { data: pendingResponses, error: responsesError } = await supabase
        .from('proposal_responses')
        .select(`
          owner_id,
          selected_option_id,
          profiles!proposal_responses_owner_id_fkey (
            name,
            email
          )
        `)
        .eq('proposal_id', proposal.id)
        .is('selected_option_id', null);

      if (responsesError) {
        console.error('Error fetching pending responses:', responsesError);
        continue;
      }

      // Send reminders to owners who haven't responded
      for (const response of pendingResponses || []) {
        const profile = response.profiles as any;
        if (!profile?.email) continue;

        const variables = {
          owner_name: profile.name || 'Proprietário',
          title: proposal.title,
          description: proposal.description,
          deadline: new Date(proposal.deadline).toLocaleDateString('pt-BR'),
          proposal_url: `${portalUrl}/votacao-detalhes/${proposal.id}`,
        };

        const subject = renderTemplate(template.subject, variables);
        const bodyHtml = renderTemplate(template.body_html, variables);

        // Send email
        await resend.emails.send({
          from: mailFrom,
          to: [profile.email],
          subject,
          html: bodyHtml,
        });

        // Send push notification
        try {
          const daysLeft = Math.ceil((new Date(proposal.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
          await supabase.functions.invoke('send-push', {
            body: {
              ownerId: response.owner_id,
              payload: {
                title: '⏰ Lembrete de Votação',
                body: `${proposal.title} - Faltam ${daysLeft} dias para votar!`,
                url: `/votacao-detalhes/${proposal.id}`,
                tag: `proposal-reminder-${proposal.id}`,
              },
            },
          });
        } catch (pushError) {
          console.error('Error sending push notification:', pushError);
        }

        totalSent++;
      }
    }

    console.log('Total reminder emails sent:', totalSent);

    return new Response(
      JSON.stringify({ success: true, sent: totalSent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in notify-proposal-deadline:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});