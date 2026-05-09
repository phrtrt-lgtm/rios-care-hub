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
    <style>
      .preheader { display:none!important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all; }
      @media (prefers-color-scheme: dark) {
        .card { background:#0b1e33 !important; }
        .text { color:#f1f5f9 !important; }
        .muted { color:#cbd5e1 !important; }
        .btn { background:#d36b4d !important; }
      }
      a { color:#0f3150; }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f5f7fb;">
    <div class="preheader">A curadoria personalizada do seu imóvel está pronta para visualização.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f7fb;">
      <tr>
        <td align="center" style="padding:24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#0f3150;padding:20px;">
                <h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:24px;color:#ffffff;">
                  Rios • Portal do Proprietário
                </h1>
              </td>
            </tr>
            ${isTest ? `<tr><td style="background:#fff3cd;border-left:4px solid #ffc107;padding:10px 18px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#856404;"><strong>E-mail de teste</strong> · preview da notificação enviada à proprietária.</td></tr>` : ""}
            <tr>
              <td class="card" style="padding:24px;background:#ffffff;">
                <h2 style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:24px;color:#0f3150;">
                  Sua curadoria está pronta ✨
                </h2>
                <p class="text" style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#11243a;">
                  Olá <strong>${recipientName}</strong>,
                </p>
                <p class="text" style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#11243a;">
                  A equipe RIOS finalizou a curadoria personalizada do seu imóvel. Você vai encontrar a lista curada de itens, plano de performance editorial, observações de posicionamento e o pagamento PIX direto pelo portal.
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 16px;">
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>Etapa:</strong> 03 de 04 · Curadoria pronta
                    </td>
                  </tr>
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>Próximo passo:</strong> definir sua senha e revisar a curadoria
                    </td>
                  </tr>
                </table>
                <a href="${magicLink}" class="btn" style="display:inline-block;background:#d36b4d;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;text-align:center;">
                  Acessar minha curadoria
                </a>
                <p class="muted" style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#64748b;">
                  Link pessoal e válido por 1 hora. Depois da definição de senha, o acesso fica disponível em <a href="${portalUrl}/login" style="color:#0f3150;">${portalDomain}/login</a>.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#64748b;">
                  RIOS Hospedagens · Operação e Gestão · sistema@rioshospedagens.com.br
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

      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: profile.email,
        options: { redirectTo: `${portalUrl}/definir-senha` },
      });
      if (linkErr) throw linkErr;
      magicLink = linkData.properties?.action_link!;
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
