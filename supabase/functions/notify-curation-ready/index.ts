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
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sua curadoria RIOS está pronta</title></head>
<body style="margin:0;padding:0;background:#f4f1ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;-webkit-font-smoothing:antialiased;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    ${isTest ? `<div style="background:#fff3cd;border-left:4px solid #ffc107;padding:12px 18px;font-size:13px;color:#856404;"><strong>E-mail de teste</strong> · este é apenas um preview da notificação que a proprietária receberá.</div>` : ""}

    <!-- Header com gradiente RIOS -->
    <div style="background:linear-gradient(135deg,#e85d3a 0%,#c44a2a 100%);padding:48px 32px 56px;text-align:center;position:relative;">
      <div style="display:inline-block;background:rgba(255,255,255,0.18);border-radius:999px;padding:6px 14px;font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#fff;margin-bottom:22px;">Etapa 03 de 04 · pronta</div>
      <h1 style="margin:0;color:#fff;font-size:32px;line-height:1.1;font-weight:700;letter-spacing:-0.025em;">Sua curadoria<br>está pronta.</h1>
      <p style="margin:16px 0 0;color:rgba(255,255,255,0.92);font-size:15px;line-height:1.5;max-width:420px;margin-left:auto;margin-right:auto;">Plano de performance editorial, lista curada e pagamento direto pelo portal.</p>
    </div>

    <!-- Conteúdo -->
    <div style="padding:40px 32px 8px;">
      <p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:#1a1a1a;">Olá <strong>${recipientName}</strong>,</p>
      <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#3a3530;">A equipe RIOS finalizou a curadoria personalizada do seu imóvel. Tudo pensado pra extrair o máximo de receita e percepção de valor nas plataformas.</p>

      <!-- O que você vai encontrar -->
      <div style="font-size:11px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:#9b6b48;margin-bottom:14px;">O que você vai encontrar</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:32px;">
        <tr>
          <td style="padding:14px;background:#f4f1ec;border-radius:12px 0 0 0;width:50%;vertical-align:top;">
            <div style="font-size:20px;margin-bottom:6px;">🛍️</div>
            <div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-bottom:4px;">Lista curada</div>
            <div style="font-size:12px;color:#5a5550;line-height:1.4;">Itens com link, preço e justificativa editorial.</div>
          </td>
          <td style="width:8px;"></td>
          <td style="padding:14px;background:#f4f1ec;border-radius:0 12px 0 0;width:50%;vertical-align:top;">
            <div style="font-size:20px;margin-bottom:6px;">📈</div>
            <div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-bottom:4px;">Plano de performance</div>
            <div style="font-size:12px;color:#5a5550;line-height:1.4;">O que faz seu imóvel destacar nas OTAs.</div>
          </td>
        </tr>
        <tr><td colspan="3" style="height:8px;"></td></tr>
        <tr>
          <td style="padding:14px;background:#f4f1ec;border-radius:0 0 0 12px;vertical-align:top;">
            <div style="font-size:20px;margin-bottom:6px;">✨</div>
            <div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-bottom:4px;">Observações editoriais</div>
            <div style="font-size:12px;color:#5a5550;line-height:1.4;">Reposicionamento, iluminação e ajustes do espaço.</div>
          </td>
          <td style="width:8px;"></td>
          <td style="padding:14px;background:#f4f1ec;border-radius:0 0 12px 0;vertical-align:top;">
            <div style="font-size:20px;margin-bottom:6px;">💳</div>
            <div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-bottom:4px;">Pagamento PIX direto</div>
            <div style="font-size:12px;color:#5a5550;line-height:1.4;">QR code seguro pelo Mercado Pago, no portal.</div>
          </td>
        </tr>
      </table>

      <!-- CTA principal -->
      <div style="text-align:center;margin:8px 0 32px;">
        <a href="${magicLink}" style="display:inline-block;background:#e85d3a;color:#ffffff;text-decoration:none;padding:18px 44px;border-radius:14px;font-weight:600;font-size:16px;letter-spacing:0.01em;box-shadow:0 10px 28px rgba(232,93,58,0.28);">Criar minha senha e ver a curadoria</a>
        <p style="margin:14px 0 0;font-size:12px;color:#8a847d;">Link pessoal e válido por 1 hora.</p>
      </div>

      <!-- Como funciona -->
      <div style="background:#f4f1ec;border-radius:14px;padding:22px 24px;margin:28px 0 8px;">
        <div style="font-size:11px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:#9b6b48;margin-bottom:12px;">Como funciona o pagamento</div>
        <p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#3a3530;"><strong style="color:#1a1a1a;">Você paga a curadoria pra RIOS.</strong> O valor total dos itens é enviado direto pra nós via PIX, com o pagamento confirmado automaticamente seu acesso ao portal RIOS é liberado por completo.</p>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#3a3530;"><strong style="color:#1a1a1a;">Cuidamos de tudo: compras, frete, montagem e instalação.</strong> Custos extras de execução são consolidados depois e cobrados de forma transparente na sua plataforma RIOS, junto das demais cobranças do imóvel.</p>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:28px 32px;border-top:1px solid #ece8e0;background:#fafaf7;">
      <p style="margin:0 0 8px;font-size:12px;color:#5a5550;line-height:1.5;">Depois de definir sua senha, o acesso fica disponível em <a href="${portalUrl}/login" style="color:#e85d3a;text-decoration:none;font-weight:600;">${portalDomain}/login</a>.</p>
      <p style="margin:0;font-size:11px;color:#8a847d;line-height:1.6;">RIOS Hospedagens · Operação e Gestão · sistema@rioshospedagens.com.br</p>
    </div>
  </div>
</body></html>`;
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
