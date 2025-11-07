import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@4.0.0";
import { renderTemplate, getTemplate } from "../_shared/template-renderer.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotifyProposalRequest {
  proposalId: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { proposalId }: NotifyProposalRequest = await req.json();

    console.log('Notifying proposal created:', proposalId);

    // Fetch proposal details
    const { data: proposal, error: proposalError } = await supabase
      .from('proposals')
      .select('*')
      .eq('id', proposalId)
      .single();

    if (proposalError || !proposal) {
      throw new Error('Proposal not found');
    }

    // Fetch responses to get list of owners
    const { data: responses, error: responsesError } = await supabase
      .from('proposal_responses')
      .select(`
        owner_id,
        profiles!proposal_responses_owner_id_fkey (
          name,
          email
        )
      `)
      .eq('proposal_id', proposalId);

    if (responsesError) {
      throw new Error('Error fetching responses');
    }

    // Get email template
    const template = await getTemplate(supabase, 'proposal_created');
    if (!template) {
      throw new Error('Email template not found');
    }

    const mailFrom = Deno.env.get('MAIL_FROM') || 'noreply@resend.dev';
    const results = [];

    // Send email to each owner
    for (const response of responses || []) {
      const profile = response.profiles as any;
      if (!profile?.email) continue;

      const variables = {
        owner_name: profile.name || 'Proprietário',
        title: proposal.title,
        description: proposal.description,
        amount: proposal.amount_cents 
          ? `R$ ${(proposal.amount_cents / 100).toFixed(2)}`
          : '',
        deadline: new Date(proposal.deadline).toLocaleDateString('pt-BR'),
      };

      const subject = renderTemplate(template.subject, variables);
      const bodyHtml = renderTemplate(template.body_html, variables);

      const emailResult = await resend.emails.send({
        from: mailFrom,
        to: [profile.email],
        subject,
        html: bodyHtml,
      });

      results.push({
        owner_id: response.owner_id,
        email: profile.email,
        result: emailResult,
      });
    }

    console.log('Emails sent:', results.length);

    return new Response(
      JSON.stringify({ success: true, sent: results.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in notify-proposal-created:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});