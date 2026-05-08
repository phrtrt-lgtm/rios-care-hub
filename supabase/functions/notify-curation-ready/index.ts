import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { owner_id, curation_id, test_email } = await req.json();
    const portalUrl = Deno.env.get("PORTAL_URL") || "https://portal.rioshospedagens.com.br";

    let recipientEmail: string;
    let recipientName: string;
    let magicLink: string;

    if (test_email) {
      // Modo teste: envia para o e-mail informado, sem persistir notificação nem gerar magic link real
      recipientEmail = test_email;
      recipientName = "proprietário(a)";
      magicLink = `${portalUrl}/definir-senha`;
    } else {
      const { data: profile } = await admin
        .from("profiles")
        .select("name, email")
        .eq("id", owner_id)
        .single();

      if (!profile?.email) {
        return new Response(JSON.stringify({ error: "owner sem email" }), { status: 400, headers: corsHeaders });
      }

      recipientEmail = profile.email;
      recipientName = profile.name?.split(" ")[0] || "proprietário(a)";

      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: profile.email,
        options: { redirectTo: `${portalUrl}/definir-senha` },
      });
      if (linkErr) throw linkErr;
      magicLink = linkData.properties?.action_link!;
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
        ${test_email ? `<div style="background:#fff3cd;border-left:4px solid #ffc107;padding:10px 14px;margin-bottom:16px;border-radius:6px;font-size:13px;color:#856404;"><strong>E-mail de teste</strong> — este é apenas um preview da notificação que o proprietário receberá.</div>` : ""}
        <h2 style="color: #e85d3a; margin-bottom: 8px;">Sua curadoria RIOS está pronta ✨</h2>
        <p style="margin-top:0;color:#555;font-size:14px;">Curadoria gratuita personalizada para o seu imóvel</p>
        <p>Olá ${recipientName},</p>
        <p>A equipe RIOS finalizou a curadoria do seu imóvel — lista de compras curada, observações editoriais e plano de performance.</p>
        <p>Pra liberar seu acesso permanente ao portal, clique no botão abaixo, <strong>crie sua senha</strong> e em seguida você verá toda a sua curadoria:</p>
        <p style="margin: 28px 0;">
          <a href="${magicLink}" style="background: #e85d3a; color: #fff; padding: 14px 24px; border-radius: 10px; text-decoration: none; font-weight: 600;">
            Criar minha senha e ver a curadoria
          </a>
        </p>
        <p style="font-size: 13px; color: #666;">O link é pessoal e válido por 1 hora. Depois de definir sua senha, você acessa o portal a qualquer momento em <a href="${portalUrl}/login" style="color:#e85d3a;">${portalUrl.replace(/^https?:\/\//,'')}/login</a>.</p>
        <p style="font-size: 12px; color: #999; margin-top: 32px;">RIOS Hospedagens · sistema@rioshospedagens.com.br</p>
      </div>
    `;

    const { error: emailErr } = await resend.emails.send({
      from: "RIOS <sistema@rioshospedagens.com.br>",
      reply_to: "rioslagoon@gmail.com",
      to: [recipientEmail],
      subject: test_email
        ? "[TESTE] Sua curadoria RIOS está pronta — acesse o portal"
        : "Sua curadoria RIOS está pronta — acesse o portal",
      html,
    });
    if (emailErr) throw emailErr;

    // Notificação no portal apenas em modo real
    if (!test_email && owner_id) {
      await admin.from("notifications").insert({
        owner_id,
        title: "Curadoria pronta",
        message: "Sua curadoria personalizada foi publicada. Acesse o portal para ver.",
        type: "curation",
        reference_url: "/bem-vindo",
        reference_id: curation_id,
      });
    }

    return new Response(JSON.stringify({ success: true, sent_to: recipientEmail }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
