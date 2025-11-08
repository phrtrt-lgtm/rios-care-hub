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
  chargeId: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { messageId, chargeId }: NotifyRequest = await req.json();

    console.log("Notification request:", { messageId, chargeId });

    // Get message details
    const { data: message } = await supabase
      .from("charge_messages")
      .select(`
        *,
        author:profiles!charge_messages_author_id_fkey(name, email, role)
      `)
      .eq("id", messageId)
      .single();

    if (!message) throw new Error("Message not found");

    // Get charge and owner details
    const { data: charge } = await supabase
      .from("charges")
      .select(`
        *,
        owner:profiles!charges_owner_id_fkey(name, email)
      `)
      .eq("id", chargeId)
      .single();

    if (!charge) throw new Error("Charge not found");

    const isTeamMessage = ["admin", "agent"].includes(message.author.role);
    
    const portalUrl = Deno.env.get("PORTAL_URL") || "https://ktzfovzwayfqczytmhno.lovableproject.com";
    const chargeUrl = `${portalUrl}/cobranca-detalhes/${chargeId}`;

    const variables = {
      owner_name: charge.owner.name,
      owner_email: charge.owner.email,
      charge_id: charge.id,
      charge_title: charge.title,
      message_body: message.body,
      author_name: message.author.name,
      message_date: new Date(message.created_at).toLocaleString("pt-BR"),
      portal_url: chargeUrl,
      charge_url: chargeUrl,
    };

    if (isTeamMessage) {
      // Team sent message, notify owner
      const template = await getTemplate(supabase, "charge_message_owner");
      
      if (template) {
        await resend.emails.send({
          from: "RIOS <sistema@rioshospedagens.com.br>",
          reply_to: "rioslagoon@gmail.com",
          to: [charge.owner.email],
          subject: renderTemplate(template.subject, variables),
          html: renderTemplate(template.body_html, variables),
        });
      }
    } else {
      // Owner sent message, notify team - only maintenance and admin can see charges
      const template = await getTemplate(supabase, "charge_message_team");
      
      if (adminEmails.length > 0 && adminEmails[0] !== "" && template) {
        // Get team members with their roles - only maintenance and admin can see charges
        const { data: teamMembers } = await supabase
          .from("profiles")
          .select("id, email, role")
          .in("role", ["admin", "maintenance"]);

        const eligibleEmails = (teamMembers || [])
          .filter(m => m.email)
          .map(m => m.email);

        // Only send if there are eligible recipients
        if (eligibleEmails.length > 0) {
          await resend.emails.send({
            from: "RIOS <sistema@rioshospedagens.com.br>",
            reply_to: "rioslagoon@gmail.com",
            to: eligibleEmails,
            subject: renderTemplate(template.subject, variables),
            html: renderTemplate(template.body_html, variables),
          });
          console.log(`Charge message notification sent to ${eligibleEmails.length} team members`);
        }
      }
    }

    console.log("Email sent successfully");

    // Send push notification
    try {
      if (isTeamMessage) {
        // Team sent message, notify owner via push
        await supabase.functions.invoke("send-push", {
          body: {
            ownerId: charge.owner_id,
            payload: {
              title: `Nova mensagem em ${charge.title}`,
              body: message.body.substring(0, 100),
              url: `/cobranca-detalhes/${chargeId}`,
              tag: `charge_message_${chargeId}`,
            },
          },
        });
      }
      console.log("Push notification sent");
    } catch (pushError) {
      console.error("Push notification error (non-critical):", pushError);
      // Don't fail the request if push fails
    }


    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in notify-charge-message function:", error);
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
