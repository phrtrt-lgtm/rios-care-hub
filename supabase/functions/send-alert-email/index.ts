import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from "https://esm.sh/resend@2.0.0";
import { renderTemplate, getTemplate } from '../_shared/template-renderer.ts';

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AlertEmailRequest {
  alertId: string
  recipientIds: string[]
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { alertId, recipientIds }: AlertEmailRequest = await req.json()
    
    console.log('Sending alert emails:', { alertId, recipientIds })

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: alert, error: alertError } = await supabase
      .from('alerts')
      .select('*')
      .eq('id', alertId)
      .single()

    if (alertError || !alert) {
      throw new Error('Alert not found')
    }

    const { data: recipients, error: recipientsError } = await supabase
      .from('profiles')
      .select('email, name')
      .in('id', recipientIds)

    if (recipientsError) {
      throw new Error('Failed to fetch recipients')
    }

    if (!recipients || recipients.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No recipients found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const typeMap: Record<string, { emoji: string, label: string, color: string }> = {
      info: { emoji: 'ℹ️', label: 'Informação', color: '#3b82f6' },
      warning: { emoji: '⚠️', label: 'Atenção', color: '#f59e0b' },
      success: { emoji: '✅', label: 'Sucesso', color: '#10b981' },
      error: { emoji: '❌', label: 'Erro', color: '#ef4444' },
    }

    const typeInfo = typeMap[alert.type] || typeMap.info
    
    const template = await getTemplate(supabase, "alert_created");

    if (!template) {
      console.error("Alert template not found");
      return new Response(
        JSON.stringify({ error: "Template not found" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const variables = {
      alert_title: alert.title,
      alert_message: alert.message,
      alert_type: alert.type,
      alert_type_label: typeInfo.label,
      alert_type_emoji: typeInfo.emoji,
      alert_color: typeInfo.color,
      alert_expires_at: alert.expires_at 
        ? new Date(alert.expires_at).toLocaleString('pt-BR')
        : "",
      created_date: new Date(alert.created_at).toLocaleString('pt-BR'),
    };
    
    let emailsSent = 0
    let pushSent = 0

    for (const recipient of recipients) {
      try {
        const { error: emailError } = await resend.emails.send({
          from: 'RIOS <sistema@rioshospedagens.com.br>',
          reply_to: 'rioslagoon@gmail.com',
          to: [recipient.email],
          subject: renderTemplate(template.subject, variables),
          html: renderTemplate(template.body_html, variables),
        });

        if (!emailError) {
          emailsSent++
          console.log(`Email sent successfully to ${recipient.email}`)
        } else {
          console.error(`Failed to send email to ${recipient.email}:`, emailError)
        }
      } catch (error) {
        console.error(`Error sending email to ${recipient.email}:`, error)
      }
    }

    // Send push notifications to all recipients
    for (const recipientId of recipientIds) {
      try {
        await supabase.functions.invoke("send-push", {
          body: {
            ownerId: recipientId,
            payload: {
              title: `${typeInfo.emoji} ${alert.title}`,
              body: alert.message.substring(0, 100),
              url: "/",
              tag: `alert_${alertId}`,
            },
          },
        });
        pushSent++
      } catch (pushError) {
        console.error(`Push notification error for recipient ${recipientId}:`, pushError)
      }
    }

    console.log(`Push notifications sent: ${pushSent}/${recipientIds.length}`)

    return new Response(
      JSON.stringify({ message: `Sent ${emailsSent}/${recipients.length} emails` }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('Error in send-alert-email:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

serve(handler)
