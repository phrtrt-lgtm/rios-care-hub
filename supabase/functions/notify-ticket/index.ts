import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { renderTemplate, getTemplate } from "../_shared/template-renderer.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

/** Escapa HTML para uso seguro dentro de blocos renderizados. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Converte o markdown da descrição do ticket em HTML estilizado,
 * casando com a identidade visual do portal RIOS (azul #0f3150 + laranja #d36b4d).
 * Suporta: ## h2, ### h3, **bold**, _italic_, listas (- com indentação),
 * blockquotes (>), parágrafos e quebras simples.
 */
function markdownToStyledHtml(md: string): string {
  if (!md || !md.trim()) return "";

  const inline = (s: string) =>
    escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#0f3150;">$1</strong>')
      .replace(/(^|\s)_([^_\n]+)_/g, '$1<em style="color:#475569;">$2</em>');

  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;

  // Buffer de listas aninhadas (apenas 2 níveis pelo formato da ficha)
  type ListItem = { text: string; children: ListItem[] };
  const flushList = (items: ListItem[]) => {
    if (!items.length) return "";
    const renderItems = (arr: ListItem[]): string =>
      arr
        .map(
          (it) =>
            `<li style="margin:4px 0;">${inline(it.text)}${
              it.children.length
                ? `<ul style="margin:6px 0 0;padding-left:20px;color:#475569;">${renderItems(
                    it.children,
                  )}</ul>`
                : ""
            }</li>`,
        )
        .join("");
    return `<ul style="margin:8px 0 14px;padding-left:22px;color:#1f2937;font-size:14px;line-height:22px;">${renderItems(
      items,
    )}</ul>`;
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // pular linhas vazias
    if (!line.trim()) {
      i++;
      continue;
    }

    // H2
    if (/^##\s+/.test(line)) {
      out.push(
        `<h2 style="margin:18px 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:24px;color:#0f3150;border-bottom:2px solid #d36b4d;padding-bottom:6px;">${inline(
          line.replace(/^##\s+/, ""),
        )}</h2>`,
      );
      i++;
      continue;
    }

    // H3
    if (/^###\s+/.test(line)) {
      out.push(
        `<h3 style="margin:18px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#0f3150;background:#f0f4f9;padding:8px 12px;border-left:3px solid #d36b4d;border-radius:4px;">${inline(
          line.replace(/^###\s+/, ""),
        )}</h3>`,
      );
      i++;
      continue;
    }

    // Blockquote (observação do proprietário)
    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(
        `<blockquote style="margin:12px 0;padding:10px 14px;background:#fff7f3;border-left:4px solid #d36b4d;border-radius:6px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#7a3d28;">${inline(
          quoteLines.join(" ").trim(),
        )}</blockquote>`,
      );
      continue;
    }

    // Listas (com itens indentados de 2 espaços para sub-itens)
    if (/^\s*-\s+/.test(line)) {
      const items: ListItem[] = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        const cur = lines[i];
        const indent = cur.match(/^(\s*)/)?.[1].length ?? 0;
        const text = cur.replace(/^\s*-\s+/, "");
        if (indent >= 2 && items.length) {
          items[items.length - 1].children.push({ text, children: [] });
        } else {
          items.push({ text, children: [] });
        }
        i++;
      }
      out.push(flushList(items));
      continue;
    }

    // Parágrafo padrão
    out.push(
      `<p style="margin:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#1f2937;">${inline(
        line,
      )}</p>`,
    );
    i++;
  }

  return out.join("\n");
}
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
          ticket_description_html: markdownToStyledHtml(ticket.description || ""),
          property_name: ticket.properties?.name || "",
          property_address: ticket.properties?.address || "",
          sla_time: ticket.priority === "urgente" ? "6 horas" : "24 horas",
          created_date: new Date().toLocaleString("pt-BR"),
          ticket_url: `${portalUrl}/ticket-detalhes/${ticket.id}`,
        };

        // Skip owner notification when it's a maintenance ticket whose cost
        // is NOT the owner's — they shouldn't worry about something they won't pay.
        const skipOwnerForMaintenance =
          ticket.ticket_type === "manutencao" &&
          (ticket.cost_responsible ?? "owner") !== "owner";

        // Send notification based on who created the ticket
        if (createdByTeam && !skipOwnerForMaintenance) {
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

          // Create notification record for owner
          await supabase.from("notifications").insert({
            owner_id: ticket.owner_id,
            title: `Novo Ticket: ${ticket.subject}`,
            message: `A equipe criou um ticket para você: ${ticket.description.substring(0, 80)}${ticket.description.length > 80 ? '...' : ''}`,
            type: "ticket",
            reference_id: ticketId,
            reference_url: `/ticket-detalhes/${ticketId}`,
          });

          // Send push notification to owner
          try {
            await supabase.functions.invoke("send-push", {
              body: {
                ownerId: ticket.owner_id,
                payload: {
                  title: `📋 Novo Ticket Criado`,
                  body: `${ticket.subject}`,
                  url: `/ticket-detalhes/${ticketId}`,
                  tag: `ticket_${ticketId}`, // Use consistent tag per ticket to group notifications
                },
              },
            });
            console.log("Push notification sent to owner");
          } catch (pushError) {
            console.error("Push error (non-critical):", pushError);
          }

        } else if (skipOwnerForMaintenance) {
          // Maintenance not owed by the owner — no notification needed.
          console.log("Skipping notifications: maintenance with non-owner cost responsible");
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
              // Maintenance can see everything EXCEPT: bloqueio_data, financeiro, conversar_hospedes, duvida
              else if (member.role === "maintenance") {
                canView = !["bloqueio_data", "financeiro", "conversar_hospedes", "duvida"].includes(ticket.ticket_type);
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

              // Send push notifications to team members
              for (const member of eligibleMembers) {
                try {
                      await supabase.functions.invoke("send-push", {
                        body: {
                          ownerId: member.id,
                          payload: {
                            title: `📋 Novo ticket de ${ticket.profiles.name}`,
                            body: `${ticket.subject}`,
                            url: `/ticket-detalhes/${ticketId}`,
                            tag: `ticket_${ticketId}`, // Use consistent tag per ticket to group notifications
                          },
                        },
                      });
                } catch (pushError) {
                  console.error("Push error for team member:", pushError);
                }
              }
              console.log("Push notifications sent to team members");
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

          // Send push notifications to admins
          for (const admin of admins) {
            try {
              await supabase.functions.invoke("send-push", {
                body: {
                  ownerId: admin.id,
                  payload: {
                    title: `👤 Nova solicitação de cadastro`,
                    body: `${user.name} (${user.email}) solicitou aprovação`,
                    url: `/aprovacoes`,
                    tag: `approval_request_${userId}`,
                  },
                },
              });
            } catch (pushError) {
              console.error("Push error for admin:", pushError);
            }
          }
          console.log("Push notifications sent to admins");
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
          portal_url: "https://portal.rioshospedagens.com.br",
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

        // Create notification for the approved user
        await supabase.from("notifications").insert({
          owner_id: userId,
          title: "Conta Aprovada! ✅",
          message: "Sua conta foi aprovada! Você já pode acessar o sistema.",
          type: "alert",
          reference_url: "/",
        });

        // Send push notification to approved user
        try {
          await supabase.functions.invoke("send-push", {
            body: {
              ownerId: userId,
              payload: {
                title: `✅ Conta Aprovada!`,
                body: `Sua conta foi aprovada! Você já pode acessar o sistema.`,
                url: `/`,
                tag: `approval_approved_${userId}`,
              },
            },
          });
          console.log("Push notification sent to approved user");
        } catch (pushError) {
          console.error("Push error (non-critical):", pushError);
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
