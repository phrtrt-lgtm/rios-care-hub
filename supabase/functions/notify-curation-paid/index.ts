import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const PORTAL_URL = Deno.env.get("PORTAL_URL") || "https://portal.rioshospedagens.com.br";

function fmtBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ownerEmailHTML(args: { name: string; amountBRL: string; portalUrl: string; isTest: boolean }) {
  const { name, amountBRL, portalUrl, isTest } = args;
  const portalDomain = portalUrl.replace(/^https?:\/\//, "");
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Acesso liberado · RIOS</title></head>
<body style="margin:0;padding:0;background:#f4f1ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;-webkit-font-smoothing:antialiased;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    ${isTest ? `<div style="background:#fff3cd;border-left:4px solid #ffc107;padding:12px 18px;font-size:13px;color:#856404;"><strong>E-mail de teste</strong> · este é apenas um preview da notificação que a proprietária receberá.</div>` : ""}

    <!-- Header com gradiente RIOS -->
    <div style="background:linear-gradient(135deg,#e85d3a 0%,#c44a2a 100%);padding:48px 32px 56px;text-align:center;">
      <div style="display:inline-block;background:rgba(255,255,255,0.18);border-radius:999px;padding:6px 14px;font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#fff;margin-bottom:22px;">Etapa 04 de 04 · concluída</div>
      <h1 style="margin:0;color:#fff;font-size:32px;line-height:1.1;font-weight:700;letter-spacing:-0.025em;">Bem-vinda<br>à RIOS, ${name}.</h1>
      <p style="margin:16px 0 0;color:rgba(255,255,255,0.92);font-size:15px;line-height:1.5;max-width:420px;margin-left:auto;margin-right:auto;">Pagamento confirmado. Seu imóvel entra agora na operação completa.</p>
    </div>

    <!-- Conteúdo -->
    <div style="padding:40px 32px 8px;">
      <!-- Card de valor pago -->
      <div style="background:#f4f1ec;border-radius:14px;padding:22px 24px;margin-bottom:32px;">
        <div style="font-size:11px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:#9b6b48;margin-bottom:8px;">Curadoria paga</div>
        <div style="font-size:28px;font-weight:700;color:#1a1a1a;letter-spacing:-0.01em;">${amountBRL}</div>
        <div style="font-size:13px;color:#5a5550;margin-top:8px;line-height:1.5;">A partir de agora a RIOS executa as compras, instalação e montagem.</div>
      </div>

      <!-- O que acontece agora -->
      <div style="font-size:11px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:#9b6b48;margin-bottom:14px;">O que acontece agora</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:32px;">
        <tr>
          <td style="padding:14px;background:#f4f1ec;border-radius:12px 0 0 0;width:50%;vertical-align:top;">
            <div style="font-size:20px;margin-bottom:6px;">🛒</div>
            <div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-bottom:4px;">Compras centralizadas</div>
            <div style="font-size:12px;color:#5a5550;line-height:1.4;">Fornecedores parceiros recebem o pedido em até 48h.</div>
          </td>
          <td style="width:8px;"></td>
          <td style="padding:14px;background:#f4f1ec;border-radius:0 12px 0 0;width:50%;vertical-align:top;">
            <div style="font-size:20px;margin-bottom:6px;">🔧</div>
            <div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-bottom:4px;">Instalação e montagem</div>
            <div style="font-size:12px;color:#5a5550;line-height:1.4;">Frete, montagem e ajustes pela equipe RIOS.</div>
          </td>
        </tr>
        <tr><td colspan="3" style="height:8px;"></td></tr>
        <tr>
          <td style="padding:14px;background:#f4f1ec;border-radius:0 0 0 12px;vertical-align:top;">
            <div style="font-size:20px;margin-bottom:6px;">📸</div>
            <div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-bottom:4px;">Sessão de fotos</div>
            <div style="font-size:12px;color:#5a5550;line-height:1.4;">Fotografia profissional para destacar o imóvel.</div>
          </td>
          <td style="width:8px;"></td>
          <td style="padding:14px;background:#f4f1ec;border-radius:0 0 12px 0;vertical-align:top;">
            <div style="font-size:20px;margin-bottom:6px;">📈</div>
            <div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-bottom:4px;">No ar nas plataformas</div>
            <div style="font-size:12px;color:#5a5550;line-height:1.4;">Anúncios otimizados e precificação dinâmica.</div>
          </td>
        </tr>
      </table>

      <!-- CTA principal -->
      <div style="text-align:center;margin:8px 0 32px;">
        <a href="${portalUrl}/login" style="display:inline-block;background:#e85d3a;color:#ffffff;text-decoration:none;padding:18px 44px;border-radius:14px;font-weight:600;font-size:16px;letter-spacing:0.01em;box-shadow:0 10px 28px rgba(232,93,58,0.28);">Acessar o portal RIOS</a>
        <p style="margin:14px 0 0;font-size:12px;color:#8a847d;">Use o e-mail e a senha que você cadastrou.</p>
      </div>

      <!-- Como funcionam os custos extras -->
      <div style="background:#f4f1ec;border-radius:14px;padding:22px 24px;margin:28px 0 8px;">
        <div style="font-size:11px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:#9b6b48;margin-bottom:12px;">Custos de execução</div>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#3a3530;">Frete, montagem e instalação são consolidados pela equipe e cobrados de forma transparente na sua plataforma RIOS, junto das demais cobranças do imóvel.</p>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:28px 32px;border-top:1px solid #ece8e0;background:#fafaf7;">
      <p style="margin:0 0 8px;font-size:12px;color:#5a5550;line-height:1.5;">Acesso disponível em <a href="${portalUrl}/login" style="color:#e85d3a;text-decoration:none;font-weight:600;">${portalDomain}/login</a>.</p>
      <p style="margin:0;font-size:11px;color:#8a847d;line-height:1.6;">RIOS Hospedagens · Operação e Gestão · sistema@rioshospedagens.com.br</p>
    </div>
  </div>
</body></html>`;
}

function teamEmailHTML(args: {
  ownerName: string;
  ownerEmail: string;
  amountBRL: string;
  curationTitle: string;
  curationId: string;
  paymentId: string;
  portalUrl: string;
  isTest: boolean;
}) {
  const { ownerName, ownerEmail, amountBRL, curationTitle, curationId, paymentId, portalUrl, isTest } = args;
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Curadoria paga · RIOS</title></head>
<body style="margin:0;padding:0;background:#f4f1ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;-webkit-font-smoothing:antialiased;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    ${isTest ? `<div style="background:#fff3cd;border-left:4px solid #ffc107;padding:12px 18px;font-size:13px;color:#856404;"><strong>E-mail de teste</strong> · preview do alerta interno.</div>` : ""}

    <!-- Header com gradiente RIOS -->
    <div style="background:linear-gradient(135deg,#e85d3a 0%,#c44a2a 100%);padding:36px 32px;text-align:center;">
      <div style="display:inline-block;background:rgba(255,255,255,0.18);border-radius:999px;padding:6px 14px;font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#fff;margin-bottom:18px;">Alerta interno · Curadoria paga</div>
      <h1 style="margin:0;color:#fff;font-size:26px;line-height:1.15;font-weight:700;letter-spacing:-0.02em;">${ownerName}<br>pagou ${amountBRL}.</h1>
    </div>

    <!-- Conteúdo -->
    <div style="padding:36px 32px 8px;">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:#9b6b48;margin-bottom:14px;">Detalhes da operação</div>

      <div style="background:#f4f1ec;border-radius:14px;padding:20px 24px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr><td style="padding:6px 0;color:#8a847d;width:140px;">Proprietária</td><td style="padding:6px 0;color:#1a1a1a;font-weight:600;">${ownerName}</td></tr>
          <tr><td style="padding:6px 0;color:#8a847d;">E-mail</td><td style="padding:6px 0;color:#1a1a1a;">${ownerEmail}</td></tr>
          <tr><td style="padding:6px 0;color:#8a847d;">Curadoria</td><td style="padding:6px 0;color:#1a1a1a;">${curationTitle || "—"}</td></tr>
          <tr><td style="padding:6px 0;color:#8a847d;">Valor</td><td style="padding:6px 0;color:#1a1a1a;font-weight:700;">${amountBRL}</td></tr>
          <tr><td style="padding:6px 0;color:#8a847d;">MP Payment ID</td><td style="padding:6px 0;color:#1a1a1a;font-family:'SF Mono',Menlo,monospace;font-size:12px;">${paymentId}</td></tr>
        </table>
      </div>

      <!-- Ação automática -->
      <div style="background:#f4f1ec;border-radius:14px;padding:18px 22px;margin-bottom:32px;">
        <div style="font-size:11px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:#9b6b48;margin-bottom:8px;">Ação automática</div>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#3a3530;">Proprietária promovida para <strong style="color:#1a1a1a;">etapa 04 (active)</strong>. Já tem acesso completo ao portal.</p>
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin:8px 0 32px;">
        <a href="${portalUrl}/admin/cadastros-proprietarios" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:12px;font-weight:600;font-size:14px;letter-spacing:0.01em;">Abrir admin</a>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:24px 32px;border-top:1px solid #ece8e0;background:#fafaf7;">
      <p style="margin:0;font-size:11px;color:#8a847d;line-height:1.6;">RIOS Hospedagens · Operação e Gestão · sistema@rioshospedagens.com.br<br>Curadoria #${curationId.slice(0, 8)}</p>
    </div>
  </div>
</body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { curation_id, payment_id, test_email } = body;

    let ownerName = "Maria Teste";
    let ownerEmail = "teste@exemplo.com";
    let amountBRL = fmtBRL(125000);
    let curationTitle = "Curadoria Teste · Apartamento Rio";
    let resolvedPaymentId = String(payment_id || "test_payment_123");
    let resolvedCurationId = String(curation_id || "00000000-0000-0000-0000-000000000000");

    if (!test_email) {
      if (!curation_id) throw new Error("curation_id obrigatório");

      const { data: curation, error: curErr } = await admin
        .from("owner_curations")
        .select("id, owner_id, title, total_amount_cents, mercadopago_payment_id")
        .eq("id", curation_id)
        .single();
      if (curErr || !curation) throw new Error("Curadoria não encontrada");

      const { data: owner } = await admin
        .from("profiles")
        .select("name, email")
        .eq("id", curation.owner_id)
        .single();

      if (!owner?.email) throw new Error("Proprietária sem email");

      ownerName = owner.name || "—";
      ownerEmail = owner.email;
      amountBRL = fmtBRL(curation.total_amount_cents || 0);
      curationTitle = curation.title || "";
      resolvedPaymentId = String(payment_id || curation.mercadopago_payment_id || "—");
      resolvedCurationId = curation.id;
    }

    const ownerFirst = ownerName.split(" ")[0] || "proprietária";
    const isTest = !!test_email;

    // Recipientes
    const ownerRecipient = test_email || ownerEmail;
    const adminEmails = test_email
      ? [test_email]
      : (Deno.env.get("ADMIN_NOTIFY_EMAILS") || "")
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean);

    // 1) Email pra proprietária (ou pro tester)
    const { error: ownerEmailErr } = await resend.emails.send({
      from: "RIOS <sistema@rioshospedagens.com.br>",
      reply_to: "rioslagoon@gmail.com",
      to: [ownerRecipient],
      subject: isTest
        ? "[TESTE proprietária] 🎉 Acesso liberado · Bem-vinda à RIOS"
        : "🎉 Acesso liberado · Bem-vinda à RIOS",
      html: ownerEmailHTML({ name: ownerFirst, amountBRL, portalUrl: PORTAL_URL, isTest }),
    });
    if (ownerEmailErr) console.error("owner email error", ownerEmailErr);

    // 2) Email pra equipe
    if (adminEmails.length > 0) {
      const { error: teamEmailErr } = await resend.emails.send({
        from: "RIOS <sistema@rioshospedagens.com.br>",
        to: adminEmails,
        subject: isTest
          ? `[TESTE equipe] 💰 Curadoria paga · ${ownerName} · ${amountBRL}`
          : `💰 Curadoria paga · ${ownerName} · ${amountBRL}`,
        html: teamEmailHTML({
          ownerName,
          ownerEmail,
          amountBRL,
          curationTitle,
          curationId: resolvedCurationId,
          paymentId: resolvedPaymentId,
          portalUrl: PORTAL_URL,
          isTest,
        }),
      });
      if (teamEmailErr) console.error("team email error", teamEmailErr);
    }

    return new Response(JSON.stringify({ success: true, sent_to: ownerRecipient, admin_to: adminEmails }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("notify-curation-paid error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
