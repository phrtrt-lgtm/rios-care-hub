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

    const { owner_id, curation_id } = await req.json();

    const { data: profile } = await admin
      .from("profiles")
      .select("name, email")
      .eq("id", owner_id)
      .single();

    if (!profile?.email) {
      return new Response(JSON.stringify({ error: "owner sem email" }), { status: 400, headers: corsHeaders });
    }

    const portalUrl = Deno.env.get("PORTAL_URL") || "https://portal.rioshospedagens.com.br";

    // Gera magic link
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: profile.email,
      options: { redirectTo: `${portalUrl}/bem-vindo` },
    });

    if (linkErr) throw linkErr;
    const magicLink = linkData.properties?.action_link;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
        <h2 style="color: #e85d3a;">Sua curadoria RIOS está pronta ✨</h2>
        <p>Olá ${profile.name?.split(" ")[0] || "proprietário(a)"},</p>
        <p>A equipe RIOS finalizou a curadoria personalizada do seu imóvel — lista de compras, observações e plano de performance.</p>
        <p style="margin: 28px 0;">
          <a href="${magicLink}" style="background: #e85d3a; color: #fff; padding: 14px 24px; border-radius: 10px; text-decoration: none; font-weight: 600;">
            Acessar minha curadoria
          </a>
        </p>
        <p style="font-size: 13px; color: #666;">Este botão te leva direto pro portal sem precisar de senha (válido por 1 hora). Depois de entrar, você pode definir uma senha em "Conta".</p>
        <p style="font-size: 12px; color: #999; margin-top: 32px;">RIOS Hospedagens · sistema@rioshospedagens.com.br</p>
      </div>
    `;

    const { error: emailErr } = await resend.emails.send({
      from: "RIOS <sistema@rioshospedagens.com.br>",
      reply_to: "rioslagoon@gmail.com",
      to: [profile.email],
      subject: "Sua curadoria RIOS está pronta — acesse o portal",
      html,
    });
    if (emailErr) throw emailErr;

    // notificação no portal (caso já tenha logado antes)
    await admin.from("notifications").insert({
      owner_id,
      title: "Curadoria pronta",
      message: "Sua curadoria personalizada foi publicada. Acesse o portal para ver.",
      type: "curation",
      reference_url: "/bem-vindo",
      reference_id: curation_id,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
