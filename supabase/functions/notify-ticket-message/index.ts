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
        author:profiles!ticket_messages_author_id_fkey(name, email, role)
      `)
      .eq("id", messageId)
      .single();

    if (!message) throw new Error("Message not found");

    const { data: ticket } = await supabase
      .from("tickets")
      .select(`
        *,
        owner:profiles!tickets_owner_id_fkey(name, email)
      `)
      .eq("id", ticketId)
      .single();

    if (!ticket) throw new Error("Ticket not found");

    const isTeamMessage = ["admin", "agent"].includes(message.author.role);

    const variables = {
      owner_name: ticket.owner.name,
      owner_email: ticket.owner.email,
      ticket_id: ticket.id,
      ticket_id_short: ticket.id.slice(0, 8),
      ticket_subject: ticket.subject,
      message_body: message.body,
      author_name: message.author.name,
      message_date: new Date(message.created_at).toLocaleString("pt-BR"),
    };

    if (isTeamMessage) {
      // Team sent message, notify owner
      const template = await getTemplate(supabase, "ticket_message_owner");
      
      if (template) {
        await resend.emails.send({
          from: "RIOS Suporte <onboarding@resend.dev>",
          reply_to: "suporte@rios.com.br",
          to: [ticket.owner.email],
          subject: renderTemplate(template.subject, variables),
          html: renderTemplate(template.body_html, variables),
        });
      }
    } else {
      // Owner sent message, notify team
      const template = await getTemplate(supabase, "ticket_message_team");
      
      if (adminEmails.length > 0 && adminEmails[0] !== "" && template) {
        await resend.emails.send({
          from: "RIOS Suporte <onboarding@resend.dev>",
          reply_to: "suporte@rios.com.br",
          to: adminEmails,
          subject: renderTemplate(template.subject, variables),
          html: renderTemplate(template.body_html, variables),
        });
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
