import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { renderTemplate, getTemplate } from "../_shared/template-renderer.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const adminEmails = (Deno.env.get("ADMIN_NOTIFY_EMAILS") || "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface NotifyRequest {
  inspectionId: string;
  propertyId: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { inspectionId, propertyId }: NotifyRequest = await req.json();
    console.log("Sending inspection notification for:", inspectionId);

    // Fetch inspection details
    const { data: inspection, error: inspError } = await supabase
      .from("cleaning_inspections")
      .select("*")
      .eq("id", inspectionId)
      .single();

    if (inspError) throw inspError;

    // Fetch property and owner details
    const { data: property } = await supabase
      .from("properties")
      .select("*, profiles!properties_owner_id_fkey(*)")
      .eq("id", propertyId)
      .single();

    // Fetch inspection settings
    const { data: settings } = await supabase
      .from("inspection_settings")
      .select("*")
      .eq("property_id", propertyId)
      .single();

    const portalUrl = `${
      Deno.env.get("PUBLIC_BASE_URL") || "https://rios-care-hub.lovable.app"
    }/admin/vistorias/${inspection.id}`;

    // 1) Send email to team/admins
    if (adminEmails.length > 0) {
      try {
        const template = await getTemplate(supabase, "inspection_created");

        if (template) {
          const variables = {
            property_name: property?.name || "Imóvel",
            cleaner_name: inspection.cleaner_name || "",
            cleaner_phone: inspection.cleaner_phone
              ? `(${inspection.cleaner_phone})`
              : "",
            inspection_date: new Date(inspection.created_at).toLocaleString(
              "pt-BR"
            ),
            inspection_notes: (
              inspection.transcript ||
              inspection.notes ||
              ""
            ).slice(0, 400),
            has_audio: !!inspection.audio_url,
            portal_url: portalUrl,
            monday_item_id: inspection.monday_item_id || "",
          };

          const subject = renderTemplate(template.subject, variables);
          const body = renderTemplate(template.body_html, variables);

          await resend.emails.send({
            from:
              Deno.env.get("MAIL_FROM") || "RIOS <onboarding@resend.dev>",
            reply_to: Deno.env.get("MAIL_REPLY_TO") || "rioslagoon@gmail.com",
            to: adminEmails,
            subject,
            html: body,
          });

          console.log("Team email sent to:", adminEmails.join(", "));
        }
      } catch (error) {
        console.error("Error sending team email:", error);
      }
    }

    // 2) Send email to owner if enabled
    if (settings?.notify_owner && property?.profiles?.email) {
      const ownerProfile = property.profiles;
      const ownerPortalUrl = `${
        Deno.env.get("PUBLIC_BASE_URL") || "https://rios-care-hub.lovable.app"
      }/vistorias/${inspection.id}`;

      try {
        await resend.emails.send({
          from: Deno.env.get("MAIL_FROM") || "RIOS <onboarding@resend.dev>",
          reply_to: Deno.env.get("MAIL_REPLY_TO") || "rioslagoon@gmail.com",
          to: ownerProfile.email,
          subject: `Nova Vistoria • ${property.name}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Nova Vistoria Registrada</h2>
              <p>Olá ${ownerProfile.name},</p>
              <p>Uma nova vistoria foi registrada para sua unidade <strong>${property.name}</strong>.</p>
              <p><strong>Data:</strong> ${new Date(
                inspection.created_at
              ).toLocaleString("pt-BR")}</p>
              <p><strong>Status:</strong> ${
                inspection.notes || "Informações disponíveis no portal"
              }</p>
              ${
                inspection.transcript
                  ? `<p><strong>Observações:</strong> ${inspection.transcript.slice(
                      0,
                      400
                    )}</p>`
                  : ""
              }
              <p><a href="${ownerPortalUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin-top: 16px;">Ver Detalhes da Vistoria</a></p>
              <p style="margin-top: 24px; color: #666; font-size: 12px;">— Equipe RIOS</p>
            </div>
          `,
        });

        console.log("Owner email sent to:", ownerProfile.email);

        // Send push notification to owner
        try {
          await supabase.functions.invoke("send-push", {
            body: {
              ownerId: property.owner_id,
              payload: {
                title: "🏠 Nova Vistoria",
                body: `Vistoria registrada para ${property.name}`,
                url: `/vistorias/${inspection.id}`,
                tag: `inspection_${inspection.id}`,
              },
            },
          });
          console.log("Push notification sent to owner");
        } catch (pushError) {
          console.error("Push notification error (non-critical):", pushError);
        }
      } catch (error) {
        console.error("Error sending owner email:", error);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-inspection-email:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
