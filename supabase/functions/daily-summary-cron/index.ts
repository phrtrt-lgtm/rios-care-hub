import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify cron token
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get cron token from config
    const { data: configData } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "daily_summary_cron_token")
      .single();

    const expectedToken = configData?.value;
    if (token !== expectedToken) {
      console.log("Invalid cron token");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all active team members and owners
    const { data: users } = await supabase
      .from("profiles")
      .select("id, email, name, role")
      .eq("status", "active")
      .in("role", ["admin", "agent", "maintenance", "owner"]);

    if (!users || users.length === 0) {
      console.log("No users to send summary to");
      return new Response(JSON.stringify({ message: "No users" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const resend = resendApiKey ? new Resend(resendApiKey) : null;
    const mailFrom = Deno.env.get("MAIL_FROM") || "RIOS <noreply@rios.app>";

    let emailsSent = 0;
    let pushSent = 0;

    for (const user of users) {
      try {
        // Generate summary for this user
        const summaryResponse = await fetch(`${supabaseUrl}/functions/v1/daily-summary`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ userId: user.id }),
        });

        if (!summaryResponse.ok) {
          console.error(`Failed to generate summary for ${user.email}`);
          continue;
        }

        const summary = await summaryResponse.json();
        const hasUrgentItems = summary.ticketsUrgentes > 0 || summary.cobrancasAtrasadas > 0;

        // Send email
        if (resend && user.email) {
          const emailHtml = generateEmailHtml(user.name, summary);
          
          try {
            await resend.emails.send({
              from: mailFrom,
              to: [user.email],
              subject: hasUrgentItems 
                ? `⚠️ RIOS - Resumo Diário (${summary.ticketsUrgentes} urgentes)`
                : `☀️ RIOS - Resumo Diário`,
              html: emailHtml,
            });
            emailsSent++;
            console.log(`Email sent to ${user.email}`);
          } catch (emailError) {
            console.error(`Failed to send email to ${user.email}:`, emailError);
          }
        }

        // Send push notification
        try {
          const pushBody = summary.resumoIA || 
            (hasUrgentItems 
              ? `${summary.ticketsUrgentes} tickets urgentes precisam de atenção`
              : "Veja seu resumo do dia");

          await fetch(`${supabaseUrl}/functions/v1/send-push`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              ownerId: user.id,
              payload: {
                title: "☀️ Bom dia! Seu resumo está pronto",
                body: pushBody.substring(0, 100),
                url: "/resumo-diario",
                tag: "daily-summary",
              },
            }),
          });
          pushSent++;
          console.log(`Push sent to ${user.id}`);
        } catch (pushError) {
          console.error(`Failed to send push to ${user.id}:`, pushError);
        }

        // Create notification in database
        await supabase.from("notifications").insert({
          owner_id: user.id,
          type: "resumo_diario",
          title: "☀️ Resumo Diário",
          message: summary.resumoIA || "Seu resumo diário está disponível",
          reference_url: "/resumo-diario",
        });

      } catch (userError) {
        console.error(`Error processing user ${user.id}:`, userError);
      }
    }

    console.log(`Daily summary cron completed: ${emailsSent} emails, ${pushSent} push notifications`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        emailsSent, 
        pushSent,
        usersProcessed: users.length 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in daily summary cron:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function generateEmailHtml(userName: string, summary: any): string {
  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Resumo Diário RIOS</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1a365d 0%, #2563eb 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">☀️ Bom dia, ${userName}!</h1>
              <p style="color: #93c5fd; margin: 10px 0 0 0; font-size: 14px;">${today}</p>
            </td>
          </tr>
          
          <!-- AI Summary -->
          ${summary.resumoIA ? `
          <tr>
            <td style="padding: 25px 30px; background-color: #f0f9ff; border-bottom: 1px solid #e0e7ff;">
              <p style="margin: 0; color: #1e40af; font-size: 16px; line-height: 1.6;">
                💡 ${summary.resumoIA}
              </p>
            </td>
          </tr>
          ` : ''}
          
          <!-- Stats Grid -->
          <tr>
            <td style="padding: 30px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="50%" style="padding: 10px;">
                    <div style="background-color: ${summary.ticketsUrgentes > 0 ? '#fef2f2' : '#f0fdf4'}; border-radius: 8px; padding: 15px; text-align: center;">
                      <span style="font-size: 28px; font-weight: bold; color: ${summary.ticketsUrgentes > 0 ? '#dc2626' : '#16a34a'};">${summary.ticketsUrgentes}</span>
                      <p style="margin: 5px 0 0 0; color: #64748b; font-size: 12px;">Tickets Urgentes</p>
                    </div>
                  </td>
                  <td width="50%" style="padding: 10px;">
                    <div style="background-color: #eff6ff; border-radius: 8px; padding: 15px; text-align: center;">
                      <span style="font-size: 28px; font-weight: bold; color: #2563eb;">${summary.ticketsNovos}</span>
                      <p style="margin: 5px 0 0 0; color: #64748b; font-size: 12px;">Tickets Novos</p>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td width="50%" style="padding: 10px;">
                    <div style="background-color: ${summary.cobrancasAtrasadas > 0 ? '#fef2f2' : '#fefce8'}; border-radius: 8px; padding: 15px; text-align: center;">
                      <span style="font-size: 28px; font-weight: bold; color: ${summary.cobrancasAtrasadas > 0 ? '#dc2626' : '#ca8a04'};">${summary.cobrancasAtrasadas}</span>
                      <p style="margin: 5px 0 0 0; color: #64748b; font-size: 12px;">Cobranças Atrasadas</p>
                    </div>
                  </td>
                  <td width="50%" style="padding: 10px;">
                    <div style="background-color: #fefce8; border-radius: 8px; padding: 15px; text-align: center;">
                      <span style="font-size: 28px; font-weight: bold; color: #ca8a04;">${summary.cobrancasVencendo}</span>
                      <p style="margin: 5px 0 0 0; color: #64748b; font-size: 12px;">Vencendo Hoje/Amanhã</p>
                    </div>
                  </td>
                </tr>
                ${summary.vistoriasHoje > 0 || summary.manutencoesAgendadas > 0 ? `
                <tr>
                  <td width="50%" style="padding: 10px;">
                    <div style="background-color: #f5f3ff; border-radius: 8px; padding: 15px; text-align: center;">
                      <span style="font-size: 28px; font-weight: bold; color: #7c3aed;">${summary.vistoriasHoje}</span>
                      <p style="margin: 5px 0 0 0; color: #64748b; font-size: 12px;">Vistorias Hoje</p>
                    </div>
                  </td>
                  <td width="50%" style="padding: 10px;">
                    <div style="background-color: #ecfdf5; border-radius: 8px; padding: 15px; text-align: center;">
                      <span style="font-size: 28px; font-weight: bold; color: #059669;">${summary.manutencoesAgendadas}</span>
                      <p style="margin: 5px 0 0 0; color: #64748b; font-size: 12px;">Manutenções Agendadas</p>
                    </div>
                  </td>
                </tr>
                ` : ''}
              </table>
            </td>
          </tr>
          
          <!-- CTA Button -->
          <tr>
            <td style="padding: 0 30px 30px 30px; text-align: center;">
              <a href="https://ktzfovzwayfqczytmhno.lovableproject.com/resumo-diario" 
                 style="display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                Ver Resumo Completo →
              </a>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                RIOS - Gestão de Propriedades
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}
