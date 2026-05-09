import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

function buildHTML(args: { recipientName: string; magicLink: string; portalUrl: string; isTest: boolean }) {
  const { recipientName, magicLink, portalUrl, isTest } = args;
  const portalDomain = portalUrl.replace(/^https?:\/\//, "");
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>Sua curadoria RIOS está pronta</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light only">
    <meta name="supported-color-schemes" content="light">
    <style>
      :root { color-scheme: light only; supported-color-schemes: light; }
      body, table, td, a, p, h1, h2, h3, span, strong { -webkit-text-size-adjust:100%; }
      .preheader { display:none!important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all; }
      a { color:#0f3150; }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f5f7fb;color-scheme:light only;">
    <div class="preheader">✨ Sua curadoria personalizada está pronta — veja a lista, o plano de performance e pague pelo PIX.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f7fb;">
      <tr>
        <td align="center" style="padding:24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
            <tr>
              <td style="background:#0f3150;padding:20px;">
                <h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:24px;color:#ffffff;">
                  Rios • Portal do Proprietário
                </h1>
              </td>
            </tr>
            ${isTest ? `<tr><td style="background:#fff3cd;border-left:4px solid #ffc107;padding:10px 18px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#856404;"><strong>E-mail de teste</strong> · preview da notificação enviada à proprietária.</td></tr>` : ""}
            <tr>
              <td style="padding:24px;background:#ffffff;">
                <h2 style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:26px;color:#0f3150;">
                  ✨ Sua curadoria está pronta!
                </h2>
                <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#11243a;">
                  Olá <strong style="color:#11243a;">${recipientName}</strong>,
                </p>
                <p style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#11243a;">
                  A equipe RIOS finalizou a curadoria personalizada do seu imóvel. Cada item foi pensado pra extrair o máximo de receita e percepção de valor nas plataformas. 🏡✨
                </p>

                <p style="margin:18px 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#0f3150;">
                  <strong style="color:#0f3150;">📋 O que você vai encontrar:</strong>
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px;">
                  <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:4px 0;">🛍️ <strong style="color:#11243a;">Lista curada</strong> — itens com link, preço e justificativa editorial</td></tr>
                  <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:4px 0;">📈 <strong style="color:#11243a;">Plano de performance</strong> — o que faz seu imóvel destacar nas OTAs</td></tr>
                  <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:4px 0;">💡 <strong style="color:#11243a;">Observações editoriais</strong> — reposicionamento, iluminação e ajustes</td></tr>
                  <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:4px 0;">💳 <strong style="color:#11243a;">Pagamento PIX direto</strong> — QR code seguro pelo Mercado Pago, no portal</td></tr>
                </table>

                <p style="margin:18px 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#0f3150;">
                  <strong style="color:#0f3150;">🚀 Como funciona o processo:</strong>
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;">
                  <tr><td style="background:#eef2f7;border-radius:8px;padding:12px 14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#11243a;border:1px solid #dbe3ec;">1️⃣ <strong style="color:#11243a;">Você acessa</strong> o portal e revisa a curadoria completa</td></tr>
                  <tr><td style="height:6px;line-height:6px;font-size:6px;">&nbsp;</td></tr>
                  <tr><td style="background:#eef2f7;border-radius:8px;padding:12px 14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#11243a;border:1px solid #dbe3ec;">2️⃣ <strong style="color:#11243a;">Paga via PIX</strong> direto na plataforma — rápido e seguro</td></tr>
                  <tr><td style="height:6px;line-height:6px;font-size:6px;">&nbsp;</td></tr>
                  <tr><td style="background:#eef2f7;border-radius:8px;padding:12px 14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#11243a;border:1px solid #dbe3ec;">3️⃣ <strong style="color:#11243a;">RIOS executa tudo</strong> 📦 compras, frete, montagem e instalação</td></tr>
                  <tr><td style="height:6px;line-height:6px;font-size:6px;">&nbsp;</td></tr>
                  <tr><td style="background:#eef2f7;border-radius:8px;padding:12px 14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#11243a;border:1px solid #dbe3ec;">4️⃣ <strong style="color:#11243a;">Acesso liberado</strong> 🔓 ao portal completo após confirmação do pagamento</td></tr>
                </table>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px;">
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      📍 <strong style="color:#11243a;">Etapa atual:</strong> 03 de 04 · Curadoria pronta
                    </td>
                  </tr>
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      👉 <strong style="color:#11243a;">Próximo passo:</strong> definir sua senha e revisar tudo
                    </td>
                  </tr>
                </table>

                <a href="${magicLink}" style="display:inline-block;background:#d36b4d;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:10px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;text-align:center;font-weight:600;">
                  ✨ Acessar minha curadoria
                </a>
                <p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#64748b;">
                  🔐 Link pessoal e seguro — gera um acesso novo toda vez que você clica. Depois da definição de senha, o portal fica disponível em <a href="${portalUrl}/login" style="color:#0f3150;">${portalDomain}/login</a>.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#64748b;">
                  RIOS Hospedagens · Operação e Gestão · ✉️ sistema@rioshospedagens.com.br
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Authorization is enforced at the gateway via verify_jwt in config.toml.


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
      recipientEmail = test_email;
      recipientName = "proprietária";
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
      recipientName = profile.name?.split(" ")[0] || "proprietária";

      // Cria token permanente; o link do e-mail nunca expira.
      // No clique, a função pública `curation-access` gera um magic link fresco.
      const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const { error: tokErr } = await admin.from("curation_access_tokens").insert({
        token,
        owner_id,
        curation_id: curation_id ?? null,
      });
      if (tokErr) throw tokErr;
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      magicLink = `${supabaseUrl}/functions/v1/curation-access?token=${token}`;
    }

    const html = buildHTML({
      recipientName,
      magicLink,
      portalUrl,
      isTest: !!test_email,
    });

    const { error: emailErr } = await resend.emails.send({
      from: "RIOS <sistema@rioshospedagens.com.br>",
      reply_to: "rioslagoon@gmail.com",
      to: [recipientEmail],
      subject: test_email
        ? "[TESTE] Sua curadoria RIOS está pronta"
        : "Sua curadoria RIOS está pronta ✨",
      html,
    });
    if (emailErr) throw emailErr;

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
