import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { renderTemplate, getTemplate } from "../_shared/template-renderer.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const adminEmails = (Deno.env.get("ADMIN_NOTIFY_EMAILS") || "").split(",");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotifyRequest {
  messageId: string;
  ticketId: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { messageId, ticketId }: NotifyRequest = await req.json();

    console.log("Notification request:", { messageId, ticketId });

    // Get message, ticket and owner details
    const { data: message } = await supabase
      .from("ticket_messages")
      .select(`
        *,
        author:profiles!ticket_messages_author_id_fkey(id, name, email, role)
      `)
      .eq("id", messageId)
      .single();

    if (!message) throw new Error("Message not found");

    const { data: ticket } = await supabase
      .from("tickets")
      .select(`
        *,
        owner:profiles!tickets_owner_id_fkey(id, name, email)
      `)
      .eq("id", ticketId)
      .single();

    if (!ticket) throw new Error("Ticket not found");

    const isTeamMessage = ["admin", "agent", "maintenance"].includes(message.author.role);

    const portalUrl = Deno.env.get("PORTAL_URL") || "https://portal.rioshospedagens.com.br";
    const ticketUrl = `${portalUrl}/ticket-detalhes/${ticketId}`;

    const variables = {
      owner_name: ticket.owner.name,
      owner_email: ticket.owner.email,
      ticket_id: ticket.id,
      ticket_id_short: ticket.id.slice(0, 8),
      ticket_subject: ticket.subject,
      message_body: message.body,
      author_name: message.author.name,
      message_date: new Date(message.created_at).toLocaleString("pt-BR"),
      ticket_url: ticketUrl,
    };

    if (isTeamMessage) {
      // Team sent message, notify owner
      const template = await getTemplate(supabase, "ticket_message_owner");
      
      if (template) {
        await resend.emails.send({
          from: "RIOS Suporte <sistema@rioshospedagens.com.br>",
          reply_to: "rioslagoon@gmail.com",
          to: [ticket.owner.email],
          subject: renderTemplate(template.subject, variables),
          html: renderTemplate(template.body_html, variables),
        });
      }

      // Create notification record for owner (this triggers push via database trigger)
      await supabase.from("notifications").insert({
        owner_id: ticket.owner_id,
        title: `Nova resposta no ticket #${ticket.id.slice(0, 8)}`,
        message: `${message.author.name}: ${message.body.substring(0, 100)}${message.body.length > 100 ? '...' : ''}`,
        type: "ticket",
        reference_id: ticketId,
        reference_url: `/ticket-detalhes/${ticketId}`,
      });
      console.log("Notification created for owner");

    } else {
      // Owner sent message, notify team - filter by ticket type permissions
      const template = await getTemplate(supabase, "ticket_message_team");
      
      if (template) {
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
            subject: renderTemplate(template.subject, variables),
            html: renderTemplate(template.body_html, variables),
          });
          console.log(`Team message notification sent to ${eligibleEmails.length} eligible members`);

          // Create notification records for each team member
          const notifications = eligibleMembers.map(member => ({
            owner_id: member.id,
            title: `Nova mensagem no ticket #${ticket.id.slice(0, 8)}`,
            message: `${ticket.owner.name}: ${message.body.substring(0, 100)}${message.body.length > 100 ? '...' : ''}`,
            type: "ticket",
            reference_id: ticketId,
            reference_url: `/ticket-detalhes/${ticketId}`,
          }));

          await supabase.from("notifications").insert(notifications);
          console.log(`Created ${notifications.length} notification records for team members`);
        }
      }
    }

    console.log("Email sent successfully");

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in notify-ticket-message function:", error);
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
