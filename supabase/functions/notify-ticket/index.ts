import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@4.0.0";

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
          .select("*, profiles!tickets_owner_id_fkey(name, email)")
          .eq("id", ticketId)
          .single();

        if (!ticket) throw new Error("Ticket not found");

        // Send confirmation to owner
        await resend.emails.send({
          from: "RIOS Suporte <onboarding@resend.dev>",
          to: [ticket.profiles.email],
          subject: `Chamado #${ticket.id.slice(0, 8)} criado com sucesso`,
          html: `
            <h1>Chamado criado com sucesso!</h1>
            <p>Olá ${ticket.profiles.name},</p>
            <p>Seu chamado foi recebido e nossa equipe está analisando.</p>
            <p><strong>Assunto:</strong> ${ticket.subject}</p>
            <p><strong>Prioridade:</strong> ${ticket.priority === "urgente" ? "Urgente" : "Normal"}</p>
            <p><strong>Previsão de primeira resposta:</strong> ${
              ticket.priority === "urgente" ? "6 horas" : "24 horas"
            }</p>
            <p>Agradecemos pela confiança!</p>
          `,
        });

        // Notify team
        if (adminEmails.length > 0 && adminEmails[0] !== "") {
          await resend.emails.send({
            from: "RIOS Suporte <onboarding@resend.dev>",
            to: adminEmails,
            subject: `Novo chamado: ${ticket.subject}`,
            html: `
              <h1>Novo chamado criado</h1>
              <p><strong>Cliente:</strong> ${ticket.profiles.name}</p>
              <p><strong>Assunto:</strong> ${ticket.subject}</p>
              <p><strong>Tipo:</strong> ${ticket.ticket_type}</p>
              <p><strong>Prioridade:</strong> ${ticket.priority === "urgente" ? "🔴 Urgente" : "Normal"}</p>
              <p><strong>Descrição:</strong></p>
              <p>${ticket.description}</p>
            `,
          });
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

        // Notify admins
        if (adminEmails.length > 0 && adminEmails[0] !== "") {
          emailResponse = await resend.emails.send({
            from: "RIOS Suporte <onboarding@resend.dev>",
            to: adminEmails,
            subject: "Novo cadastro aguardando aprovação",
            html: `
              <h1>Novo cadastro para aprovação</h1>
              <p><strong>Nome:</strong> ${user.name}</p>
              <p><strong>E-mail:</strong> ${user.email}</p>
              <p><strong>Telefone:</strong> ${user.phone || "Não informado"}</p>
              <p>Acesse o painel administrativo para aprovar ou recusar este cadastro.</p>
            `,
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

        // Send welcome email
        emailResponse = await resend.emails.send({
          from: "RIOS Suporte <onboarding@resend.dev>",
          to: [user.email],
          subject: "Seu acesso foi aprovado!",
          html: `
            <h1>Bem-vindo ao Portal RIOS!</h1>
            <p>Olá ${user.name},</p>
            <p>Seu cadastro foi aprovado com sucesso!</p>
            <p>Você já pode acessar o portal e abrir seus chamados.</p>
            <p>Estamos à disposição para atendê-lo!</p>
          `,
        });
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