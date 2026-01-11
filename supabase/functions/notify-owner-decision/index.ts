import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface NotifyRequest {
  type: "decision_pending" | "decision_reminder" | "decision_made";
  ticketId: string;
  decision?: "owner_will_fix" | "pm_will_fix";
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { type, ticketId, decision }: NotifyRequest = await req.json();

    console.log("Owner decision notification:", { type, ticketId, decision });

    // Get ticket details
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select(`
        *,
        profiles!tickets_owner_id_fkey(id, name, email),
        properties(name, address)
      `)
      .eq("id", ticketId)
      .single();

    if (ticketError || !ticket) {
      throw new Error("Ticket not found");
    }

    const portalUrl = Deno.env.get("PORTAL_URL") || "https://portal.rioshospedagens.com.br";
    const ticketUrl = `${portalUrl}/ticket-detalhes/${ticketId}`;
    const dueDate = ticket.owner_action_due_at 
      ? new Date(ticket.owner_action_due_at).toLocaleString("pt-BR", { 
          dateStyle: "short", 
          timeStyle: "short" 
        })
      : "72 horas";

    switch (type) {
      case "decision_pending": {
        // Notify owner that they need to make a decision within 72h
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1e40af;">⚠️ Decisão Necessária - Manutenção</h2>
            <p>Olá <strong>${ticket.profiles.name}</strong>,</p>
            <p>Foi identificada uma necessidade de manutenção no seu imóvel <strong>${ticket.properties?.name || "N/A"}</strong>:</p>
            
            <div style="background: #f8fafc; border-left: 4px solid #f59e0b; padding: 16px; margin: 16px 0;">
              <h3 style="margin: 0 0 8px 0;">${ticket.subject}</h3>
              <p style="margin: 0; color: #64748b;">${ticket.description}</p>
            </div>
            
            <p><strong>Você tem até ${dueDate} para decidir:</strong></p>
            
            <div style="margin: 20px 0;">
              <p style="margin: 8px 0;">
                <strong>🔧 Assumir execução:</strong> Você contratará ou executará a manutenção por conta própria.
              </p>
              <p style="margin: 8px 0;">
                <strong>👥 Delegar à gestão:</strong> Nós cuidaremos de tudo, com possibilidade de aporte para economia e conveniência.
              </p>
            </div>
            
            <p style="background: #fef3c7; padding: 12px; border-radius: 8px;">
              <strong>⏰ Importante:</strong> Se você não responder até o prazo, a gestão poderá assumir a execução para evitar prejuízos operacionais ao imóvel.
            </p>
            
            <a href="${ticketUrl}" style="display: inline-block; background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 16px 0;">
              Tomar Decisão
            </a>
            
            <p style="color: #64748b; font-size: 14px;">Equipe RIOS Hospedagens</p>
          </div>
        `;

        await resend.emails.send({
          from: "RIOS Suporte <sistema@rioshospedagens.com.br>",
          reply_to: "rioslagoon@gmail.com",
          to: [ticket.profiles.email],
          subject: `⚠️ Decisão necessária: ${ticket.subject}`,
          html: emailHtml,
        });

        // Create notification
        await supabase.from("notifications").insert({
          owner_id: ticket.owner_id,
          title: "⚠️ Decisão necessária - Manutenção",
          message: `Você tem 72h para decidir sobre: ${ticket.subject}`,
          type: "maintenance",
          reference_id: ticketId,
          reference_url: `/ticket-detalhes/${ticketId}`,
        });

        // Send push notification
        try {
          await supabase.functions.invoke("send-push", {
            body: {
              ownerId: ticket.owner_id,
              payload: {
                title: `⚠️ Decisão necessária - Manutenção`,
                body: `Você tem 72h para decidir: ${ticket.subject}`,
                url: `/ticket-detalhes/${ticketId}`,
                tag: `decision_pending_${ticketId}`,
              },
            },
          });
          console.log("Push notification sent to owner");
        } catch (pushError) {
          console.error("Push error (non-critical):", pushError);
        }

        console.log("Decision pending notification sent");
        break;
      }

      case "decision_reminder": {
        // 24h reminder before deadline
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc2626;">🔔 Lembrete: Menos de 24h para decidir!</h2>
            <p>Olá <strong>${ticket.profiles.name}</strong>,</p>
            <p>Você ainda não respondeu sobre a manutenção do seu imóvel <strong>${ticket.properties?.name || "N/A"}</strong>:</p>
            
            <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; margin: 16px 0;">
              <h3 style="margin: 0 0 8px 0;">${ticket.subject}</h3>
              <p style="margin: 0;">Prazo: <strong>${dueDate}</strong></p>
            </div>
            
            <p>Se você não tomar uma decisão até o prazo, a gestão assumirá a execução da manutenção conforme nossa política.</p>
            
            <a href="${ticketUrl}" style="display: inline-block; background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 16px 0;">
              Tomar Decisão Agora
            </a>
            
            <p style="color: #64748b; font-size: 14px;">Equipe RIOS Hospedagens</p>
          </div>
        `;

        await resend.emails.send({
          from: "RIOS Suporte <sistema@rioshospedagens.com.br>",
          reply_to: "rioslagoon@gmail.com",
          to: [ticket.profiles.email],
          subject: `🔔 LEMBRETE: ${ticket.subject} - Menos de 24h!`,
          html: emailHtml,
        });

        // Create notification
        await supabase.from("notifications").insert({
          owner_id: ticket.owner_id,
          title: "🔔 Lembrete: Menos de 24h!",
          message: `Decida sobre: ${ticket.subject}`,
          type: "maintenance",
          reference_id: ticketId,
          reference_url: `/ticket-detalhes/${ticketId}`,
        });

        // Send push notification
        try {
          await supabase.functions.invoke("send-push", {
            body: {
              ownerId: ticket.owner_id,
              payload: {
                title: `🔔 URGENTE: Menos de 24h!`,
                body: `Decida sobre: ${ticket.subject}`,
                url: `/ticket-detalhes/${ticketId}`,
                tag: `decision_reminder_${ticketId}`,
              },
            },
          });
          console.log("Push notification sent to owner");
        } catch (pushError) {
          console.error("Push error (non-critical):", pushError);
        }

        console.log("24h reminder sent");
        break;
      }

      case "decision_made": {
        // Notify team when owner makes a decision
        const decisionText = decision === "owner_will_fix" 
          ? "assumiu a execução"
          : "delegou à gestão";
        
        const decisionEmoji = decision === "owner_will_fix" ? "🔧" : "👥";

        // Get team members
        const { data: teamMembers } = await supabase
          .from("profiles")
          .select("id, email")
          .in("role", ["admin", "maintenance"]);

        if (teamMembers && teamMembers.length > 0) {
          const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #059669;">${decisionEmoji} Decisão do Proprietário</h2>
              <p><strong>${ticket.profiles.name}</strong> ${decisionText} para a manutenção:</p>
              
              <div style="background: #f0fdf4; border-left: 4px solid #059669; padding: 16px; margin: 16px 0;">
                <p style="margin: 0 0 8px 0;"><strong>Imóvel:</strong> ${ticket.properties?.name || "N/A"}</p>
                <p style="margin: 0 0 8px 0;"><strong>Assunto:</strong> ${ticket.subject}</p>
                <p style="margin: 0;"><strong>Decisão:</strong> ${decision === "owner_will_fix" ? "Proprietário executará" : "Gestão executará"}</p>
              </div>
              
              <a href="${ticketUrl}" style="display: inline-block; background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 16px 0;">
                Ver Detalhes
              </a>
            </div>
          `;

          const teamEmails = teamMembers.map(m => m.email).filter(Boolean);
          if (teamEmails.length > 0) {
            await resend.emails.send({
              from: "RIOS Suporte <sistema@rioshospedagens.com.br>",
              reply_to: "rioslagoon@gmail.com",
              to: teamEmails,
              subject: `${decisionEmoji} Decisão: ${ticket.profiles.name} ${decisionText}`,
              html: emailHtml,
            });
          }

          // Create notifications for team
          const notifications = teamMembers.map(member => ({
            owner_id: member.id,
            title: `${decisionEmoji} Decisão do proprietário`,
            message: `${ticket.profiles.name} ${decisionText}: ${ticket.subject}`,
            type: "maintenance",
            reference_id: ticketId,
            reference_url: `/ticket-detalhes/${ticketId}`,
          }));
          await supabase.from("notifications").insert(notifications);

          // Send push notifications to team members
          for (const member of teamMembers) {
            try {
              await supabase.functions.invoke("send-push", {
                body: {
                  ownerId: member.id,
                  payload: {
                    title: `${decisionEmoji} Decisão do proprietário`,
                    body: `${ticket.profiles.name} ${decisionText}: ${ticket.subject}`,
                    url: `/ticket-detalhes/${ticketId}`,
                    tag: `decision_made_${ticketId}`,
                  },
                },
              });
            } catch (pushError) {
              console.error("Push error for team member:", pushError);
            }
          }
          console.log("Push notifications sent to team members");
        }

        console.log("Decision notification sent to team");
        break;
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in notify-owner-decision:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
