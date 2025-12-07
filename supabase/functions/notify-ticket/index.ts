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
            profiles!tickets_owner_id_fkey(id, name, email),
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

          // Create notification record for owner (this triggers push via database trigger)
          await supabase.from("notifications").insert({
            owner_id: ticket.owner_id,
            title: `Novo Ticket: ${ticket.subject}`,
            message: `A equipe criou um ticket para você: ${ticket.description.substring(0, 80)}${ticket.description.length > 80 ? '...' : ''}`,
            type: "ticket",
            reference_id: ticketId,
            reference_url: `/ticket-detalhes/${ticketId}`,
          });
          console.log("Notification created for owner");

        } else {
          // Ticket created by owner → Notify TEAM only
          if (teamTemplate) {
            // Get team members with their roles
            const { data: teamMembers } = await supabase
              .from("profiles")
              .select("id, email, role")
              .in("role", ["admin", "agent", "maintenance"]);

            // Filter team members based on ticket type visibility
            const eligibleMembers: { id: string; email: string }[] = [];
            
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
                eligibleMembers.push({ id: member.id, email: member.email });
              }
            }

            // Only send if there are eligible recipients
            if (eligibleMembers.length > 0) {
              const eligibleEmails = eligibleMembers.map(m => m.email);
              await resend.emails.send({
                from: "RIOS Suporte <sistema@rioshospedagens.com.br>",
                reply_to: "rioslagoon@gmail.com",
                to: eligibleEmails,
                subject: renderTemplate(teamTemplate.subject, variables),
                html: renderTemplate(teamTemplate.body_html, variables),
              });
              console.log(`Team notification sent to ${eligibleEmails.length} eligible members (ticket created by owner)`);

              // Create notification records for each team member
              const notifications = eligibleMembers.map(member => ({
                owner_id: member.id,
                title: `Novo ticket de ${ticket.profiles.name}`,
                message: `${ticket.subject}: ${ticket.description.substring(0, 80)}${ticket.description.length > 80 ? '...' : ''}`,
                type: "ticket",
                reference_id: ticketId,
                reference_url: `/ticket-detalhes/${ticketId}`,
              }));

              await supabase.from("notifications").insert(notifications);
              console.log(`Created ${notifications.length} notification records for team members`);
            } else {
              console.log("No eligible team members for this ticket type");
            }
          }

          // Create confirmation notification for owner
          await supabase.from("notifications").insert({
            owner_id: ticket.owner_id,
            title: `Ticket Criado: ${ticket.subject}`,
            message: `Recebemos seu ticket e responderemos em breve`,
            type: "ticket",
            reference_id: ticketId,
            reference_url: `/ticket-detalhes/${ticketId}`,
          });
          console.log("Confirmation notification created for owner");
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

        // Create notification for admins
        const { data: admins } = await supabase
          .from("profiles")
          .select("id")
          .eq("role", "admin");

        if (admins && admins.length > 0) {
          const notifications = admins.map(admin => ({
            owner_id: admin.id,
            title: "Nova solicitação de cadastro",
            message: `${user.name} (${user.email}) solicitou aprovação`,
            type: "alert",
            reference_url: "/aprovacoes",
          }));
          await supabase.from("notifications").insert(notifications);
          console.log(`Created ${notifications.length} notification records for admins`);
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

        // Create notification for the approved user (triggers push via database trigger)
        await supabase.from("notifications").insert({
          owner_id: userId,
          title: "Conta Aprovada! ✅",
          message: "Sua conta foi aprovada! Você já pode acessar o sistema.",
          type: "alert",
          reference_url: "/",
        });
        console.log("Approval notification created for user");
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
