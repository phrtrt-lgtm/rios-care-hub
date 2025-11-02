import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AlertEmailRequest {
  alert_id: string;
  title: string;
  message: string;
  type: string;
  recipient_ids: string[];
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      alert_id,
      title,
      message,
      type,
      recipient_ids,
    }: AlertEmailRequest = await req.json();

    console.log(`Sending alert ${alert_id} to ${recipient_ids.length} recipients`);

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch recipient emails
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("email, name")
      .in("id", recipient_ids);

    if (profilesError) {
      throw new Error(`Failed to fetch profiles: ${profilesError.message}`);
    }

    if (!profiles || profiles.length === 0) {
      console.log("No recipients found");
      return new Response(
        JSON.stringify({ message: "No recipients found" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Get type emoji and label
    const typeMap: Record<string, { emoji: string; label: string; color: string }> = {
      info: { emoji: "ℹ️", label: "Informação", color: "#3b82f6" },
      warning: { emoji: "⚠️", label: "Aviso", color: "#f59e0b" },
      error: { emoji: "❌", label: "Erro", color: "#ef4444" },
      success: { emoji: "✅", label: "Sucesso", color: "#10b981" },
    };

    const typeInfo = typeMap[type] || typeMap.info;

    // Send emails to all recipients
    const emailPromises = profiles.map(async (profile) => {
      try {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: "RIOS Gestão <onboarding@resend.dev>",
            to: [profile.email],
            subject: `${typeInfo.emoji} ${title}`,
          html: `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
              </head>
              <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 0;">
                  <tr>
                    <td align="center">
                      <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <tr>
                          <td style="padding: 32px; border-bottom: 4px solid ${typeInfo.color};">
                            <h1 style="margin: 0; font-size: 24px; color: #111827;">
                              ${typeInfo.emoji} ${title}
                            </h1>
                            <p style="margin: 8px 0 0 0; font-size: 14px; color: #6b7280;">
                              ${typeInfo.label}
                            </p>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 32px;">
                            <p style="margin: 0 0 16px 0; font-size: 16px; color: #374151; line-height: 1.6; white-space: pre-wrap;">
                              ${message}
                            </p>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 0 32px 32px 32px;">
                            <a href="${supabaseUrl}" 
                               style="display: inline-block; background-color: ${typeInfo.color}; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px;">
                              Acessar Portal
                            </a>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 24px 32px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
                            <p style="margin: 0; font-size: 12px; color: #6b7280; line-height: 1.5;">
                              Este é um alerta automático da RIOS - Operação e Gestão de Hospedagens.
                              <br>
                              Se você tem dúvidas, responda este e-mail ou entre em contato conosco.
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </body>
            </html>
          `,
          }),
        });

        const emailResult = await emailResponse.json();
        console.log(`Email sent to ${profile.email}:`, emailResult);
        return { success: true, email: profile.email };
      } catch (error) {
        console.error(`Failed to send email to ${profile.email}:`, error);
        return { success: false, email: profile.email, error };
      }
    });

    const results = await Promise.all(emailPromises);
    const successCount = results.filter((r) => r.success).length;

    console.log(`Successfully sent ${successCount}/${results.length} emails`);

    return new Response(
      JSON.stringify({
        message: `Sent ${successCount}/${results.length} emails`,
        results,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-alert-email function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);