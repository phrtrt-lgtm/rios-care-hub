import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { renderTemplate, getTemplate } from "../_shared/template-renderer.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const adminEmails = (Deno.env.get("ADMIN_NOTIFY_EMAILS") || "").split(",");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface NotifyRequest {
  type: "ticket_created" | "ticket_message" | "approval_request" | "approval_approved";
  ticketId?: string;
  userId?: string;
  data?: any;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { type, ticketId, userId, data }: NotifyRequest = await req.json();

    console.log("Notification request:", { type, ticketId, userId });

    let emailResponse;

    switch (type) {
      case "ticket_created": {
        // Get ticket and owner details
        const { data: ticket } = await supabase
          .from("tickets")
          .select(`
            *,
            profiles!tickets_owner_id_fkey(name, email),
            properties(name, address)
          `)
          .eq("id", ticketId)
          .single();

        if (!ticket) throw new Error("Ticket not found");

        // Check if ticket was created by admin/agent or by the owner
        const createdByTeam = ticket.created_by !== ticket.owner_id;

        // Get templates - use different template if created by admin
        const ownerTemplateKey = createdByTeam ? "ticket_created_by_admin_owner" : "ticket_created_owner";
        const ownerTemplate = await getTemplate(supabase, ownerTemplateKey);
        const teamTemplate = await getTemplate(supabase, "ticket_created_team");

        const portalUrl = Deno.env.get("PORTAL_URL") || "https://portal.rioshospedagens.com.br";
        
        const variables = {
          owner_name: ticket.profiles.name,
          owner_email: ticket.profiles.email,
          ticket_id: ticket.id,
          ticket_id_short: ticket.id.slice(0, 8),
          ticket_subject: ticket.subject,
          ticket_type: ticket.ticket_type,
          ticket_priority: ticket.priority === "urgente" ? "Urgente" : "Normal",
          ticket_priority_badge: ticket.priority === "urgente" ? "🔴 Urgente" : "Normal",
          ticket_description: ticket.description,
          property_name: ticket.properties?.name || "",
          property_address: ticket.properties?.address || "",
          sla_time: ticket.priority === "urgente" ? "6 horas" : "24 horas",
          created_date: new Date().toLocaleString("pt-BR"),
          ticket_url: `${portalUrl}/ticket-detalhes/${ticket.id}`,
        };

        // Send notification based on who created the ticket
        if (createdByTeam) {
          // Ticket created by admin/agent → Notify OWNER only
          if (ownerTemplate) {
            await resend.emails.send({
              from: "RIOS Suporte <sistema@rioshospedagens.com.br>",
              reply_to: "rioslagoon@gmail.com",
              to: [ticket.profiles.email],
              subject: renderTemplate(ownerTemplate.subject, variables),
              html: renderTemplate(ownerTemplate.body_html, variables),
            });
            console.log("Owner notification sent (ticket created by team)");
          }

          // Send push notification to owner
          try {
            await supabase.functions.invoke("send-push", {
              body: {
                ownerId: ticket.owner_id,
                payload: {
                  title: `Novo Ticket: ${ticket.subject}`,
                  body: `A equipe criou um ticket para você: ${ticket.description.substring(0, 80)}`,
                  url: `/ticket-detalhes/${ticketId}`,
                  tag: `ticket_created_${ticketId}`,
                },
              },
            });
            console.log("Push notification sent to owner");
          } catch (pushError) {
            console.error("Push notification error (non-critical):", pushError);
          }
        } else {
          // Ticket created by owner → Notify TEAM only
          if (adminEmails.length > 0 && adminEmails[0] !== "" && teamTemplate) {
            // Get team members with their roles
            const { data: teamMembers } = await supabase
              .from("profiles")
              .select("id, email, role")
              .in("role", ["admin", "agent", "maintenance"]);

            // Filter team members based on ticket type visibility
            const eligibleEmails: string[] = [];
            
            for (const member of teamMembers || []) {
              let canView = false;
              
              // Admin can see everything
              if (member.role === "admin") {
                canView = true;
              }
              // Maintenance can see: duvida, informacao, bloqueio_data, manutencao, cobranca
              else if (member.role === "maintenance") {
                canView = ["duvida", "informacao", "bloqueio_data", "manutencao", "cobranca"].includes(ticket.ticket_type);
              }
              // Agent can see: duvida, informacao, conversar_hospedes, bloqueio_data
              else if (member.role === "agent") {
                canView = ["duvida", "informacao", "conversar_hospedes", "bloqueio_data"].includes(ticket.ticket_type);
              }
              
              if (canView && member.email) {
                eligibleEmails.push(member.email);
              }
            }

            // Only send if there are eligible recipients
            if (eligibleEmails.length > 0) {
              await resend.emails.send({
                from: "RIOS Suporte <sistema@rioshospedagens.com.br>",
                reply_to: "rioslagoon@gmail.com",
                to: eligibleEmails,
                subject: renderTemplate(teamTemplate.subject, variables),
                html: renderTemplate(teamTemplate.body_html, variables),
              });
              console.log(`Team notification sent to ${eligibleEmails.length} eligible members (ticket created by owner)`);
            } else {
              console.log("No eligible team members for this ticket type");
            }
          }

          // Send confirmation push to owner
          try {
            await supabase.functions.invoke("send-push", {
              body: {
                ownerId: ticket.owner_id,
                payload: {
                  title: `Ticket Criado: ${ticket.subject}`,
                  body: `Recebemos seu ticket e responderemos em breve`,
                  url: `/ticket-detalhes/${ticketId}`,
                  tag: `ticket_created_${ticketId}`,
                },
              },
            });
            console.log("Confirmation push notification sent to owner");
          } catch (pushError) {
            console.error("Push notification error (non-critical):", pushError);
          }
        }
        break;
      }

      case "approval_request": {
        // Get user details
        const { data: user } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single();

        if (!user) throw new Error("User not found");

        const template = await getTemplate(supabase, "approval_request");

        const variables = {
          user_name: user.name,
          user_email: user.email,
          user_phone: user.phone || "Não informado",
        };

        // Notify admins
        if (adminEmails.length > 0 && adminEmails[0] !== "" && template) {
          emailResponse = await resend.emails.send({
            from: "RIOS Suporte <sistema@rioshospedagens.com.br>",
            reply_to: "rioslagoon@gmail.com",
            to: adminEmails,
            subject: renderTemplate(template.subject, variables),
            html: renderTemplate(template.body_html, variables),
          });
        }
        break;
      }

      case "approval_approved": {
        // Get user details
        const { data: user } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single();

        if (!user) throw new Error("User not found");

        const template = await getTemplate(supabase, "approval_approved");

        const variables = {
          user_name: user.name,
          user_email: user.email,
          portal_url: "https://portal.rioshospedagens.com.br/",
        };

        // Send welcome email
        if (template) {
          emailResponse = await resend.emails.send({
            from: "RIOS Suporte <sistema@rioshospedagens.com.br>",
            reply_to: "rioslagoon@gmail.com",
            to: [user.email],
            subject: renderTemplate(template.subject, variables),
            html: renderTemplate(template.body_html, variables),
          });
        }

        // Send push notification about approval
        try {
          await supabase.functions.invoke("send-push", {
            body: {
              ownerId: userId,
              payload: {
                title: "Conta Aprovada! ✅",
                body: "Sua conta foi aprovada! Você já pode acessar o sistema.",
                url: "/",
                tag: `approval_${userId}`,
              },
            },
          });
          console.log("Approval push notification sent");
        } catch (pushError) {
          console.error("Push notification error (non-critical):", pushError);
        }
        break;
      }

      default:
        throw new Error("Invalid notification type");
    }

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in notify-ticket function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);