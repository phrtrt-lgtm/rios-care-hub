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

function ownerEmailHTML(args: { name: string; amountBRL: string }) {
  const { name, amountBRL } = args;
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Acesso liberado · RIOS</title></head>
<body style="margin:0;padding:0;background:#f4f1ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="background:linear-gradient(135deg,#e85d3a 0%,#c44a2a 100%);padding:48px 32px;text-align:center;">
      <div style="display:inline-block;background:rgba(255,255,255,0.18);border-radius:999px;padding:6px 14px;font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#fff;margin-bottom:18px;">Etapa 04 · concluída</div>
      <h1 style="margin:0;color:#fff;font-size:30px;line-height:1.15;font-weight:700;letter-spacing:-0.02em;">Bem-vinda à RIOS, ${name}.</h1>
      <p style="margin:14px 0 0;color:rgba(255,255,255,0.92);font-size:15px;line-height:1.5;">Pagamento confirmado. Seu imóvel entra agora na operação completa.</p>
    </div>
    <div style="padding:36px 32px;">
      <div style="background:#f4f1ec;border-radius:14px;padding:20px 22px;margin-bottom:28px;">
        <div style="font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#9b6b48;margin-bottom:6px;">Curadoria paga</div>
        <div style="font-size:26px;font-weight:700;color:#1a1a1a;letter-spacing:-0.01em;">${amountBRL}</div>
        <div style="font-size:13px;color:#5a5550;margin-top:6px;">A partir de agora a RIOS executa as compras, instalação e montagem.</div>
      </div>

      <h2 style="margin:0 0 14px;font-size:18px;font-weight:700;color:#1a1a1a;letter-spacing:-0.01em;">O que acontece agora</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #ece8e0;vertical-align:top;width:36px;"><div style="width:28px;height:28px;border-radius:8px;background:#fbeae3;color:#e85d3a;font-weight:700;text-align:center;line-height:28px;font-size:13px;">1</div></td>
          <td style="padding:12px 0 12px 14px;border-bottom:1px solid #ece8e0;font-size:14px;color:#3a3530;line-height:1.5;"><strong style="color:#1a1a1a;">Compras centralizadas</strong> — nossos fornecedores parceiros recebem o pedido em até 48h.</td>
        </tr>
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #ece8e0;vertical-align:top;"><div style="width:28px;height:28px;border-radius:8px;background:#fbeae3;color:#e85d3a;font-weight:700;text-align:center;line-height:28px;font-size:13px;">2</div></td>
          <td style="padding:12px 0 12px 14px;border-bottom:1px solid #ece8e0;font-size:14px;color:#3a3530;line-height:1.5;"><strong style="color:#1a1a1a;">Instalação e montagem</strong> — frete, montagem e ajustes são executados pela equipe RIOS. Custos extras consolidados depois na sua plataforma.</td>
        </tr>
        <tr>
          <td style="padding:12px 0;vertical-align:top;"><div style="width:28px;height:28px;border-radius:8px;background:#fbeae3;color:#e85d3a;font-weight:700;text-align:center;line-height:28px;font-size:13px;">3</div></td>
          <td style="padding:12px 0 12px 14px;font-size:14px;color:#3a3530;line-height:1.5;"><strong style="color:#1a1a1a;">No ar</strong> — sessão de fotos profissional, anúncios otimizados e precificação dinâmica rodando.</td>
        </tr>
      </table>

      <div style="text-align:center;margin:32px 0 8px;">
        <a href="${PORTAL_URL}/login" style="display:inline-block;background:#e85d3a;color:#ffffff;text-decoration:none;padding:16px 36px;border-radius:12px;font-weight:600;font-size:15px;letter-spacing:0.01em;box-shadow:0 8px 24px rgba(232,93,58,0.25);">Acessar o portal RIOS</a>
      </div>
      <p style="text-align:center;margin:8px 0 0;font-size:12px;color:#8a847d;">Use o e-mail e a senha que você cadastrou.</p>
    </div>
    <div style="padding:24px 32px;background:#1a1a1a;text-align:center;">
      <p style="margin:0;color:rgba(255,255,255,0.55);font-size:11px;line-height:1.6;">RIOS Hospedagens · Operação e Gestão<br>sistema@rioshospedagens.com.br</p>
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
}) {
  const { ownerName, ownerEmail, amountBRL, curationTitle, curationId, paymentId } = args;
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;">
    <div style="background:#1a3c2a;padding:28px 32px;color:#fff;">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:#a0c49d;margin-bottom:6px;">💰 Curadoria paga</div>
      <h1 style="margin:0;font-size:22px;font-weight:700;letter-spacing:-0.01em;">${ownerName} pagou ${amountBRL}</h1>
    </div>
    <div style="padding:28px 32px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;color:#666;width:140px;">Proprietária</td><td style="padding:8px 0;color:#1a1a1a;font-weight:600;">${ownerName}</td></tr>
        <tr><td style="padding:8px 0;color:#666;">E-mail</td><td style="padding:8px 0;color:#1a1a1a;">${ownerEmail}</td></tr>
        <tr><td style="padding:8px 0;color:#666;">Curadoria</td><td style="padding:8px 0;color:#1a1a1a;">${curationTitle || "—"}</td></tr>
        <tr><td style="padding:8px 0;color:#666;">Valor</td><td style="padding:8px 0;color:#1a1a1a;font-weight:700;">${amountBRL}</td></tr>
        <tr><td style="padding:8px 0;color:#666;">MP Payment ID</td><td style="padding:8px 0;color:#1a1a1a;font-family:monospace;font-size:12px;">${paymentId}</td></tr>
      </table>
      <div style="background:#f0f7ed;border-left:3px solid #2d5a3d;padding:14px 16px;margin:20px 0;border-radius:6px;font-size:13px;color:#2d5a3d;">
        <strong>Ação automática:</strong> proprietária promovida para etapa 04 (active). Já tem acesso completo ao portal.
      </div>
      <div style="margin:24px 0 0;">
        <a href="${PORTAL_URL}/admin/cadastros-proprietarios" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;font-size:13px;">Abrir admin</a>
      </div>
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

    const { curation_id, payment_id } = await req.json();
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

    const ownerFirst = owner.name?.split(" ")[0] || "proprietária";
    const amountBRL = fmtBRL(curation.total_amount_cents || 0);

    // 1) Email pra proprietária
    const { error: ownerEmailErr } = await resend.emails.send({
      from: "RIOS <sistema@rioshospedagens.com.br>",
      reply_to: "rioslagoon@gmail.com",
      to: [owner.email],
      subject: "🎉 Acesso liberado · Bem-vinda à RIOS",
      html: ownerEmailHTML({ name: ownerFirst, amountBRL }),
    });
    if (ownerEmailErr) console.error("owner email error", ownerEmailErr);

    // 2) Email pra equipe
    const adminEmails = (Deno.env.get("ADMIN_NOTIFY_EMAILS") || "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);

    if (adminEmails.length > 0) {
      const { error: teamEmailErr } = await resend.emails.send({
        from: "RIOS <sistema@rioshospedagens.com.br>",
        to: adminEmails,
        subject: `💰 Curadoria paga · ${owner.name} · ${amountBRL}`,
        html: teamEmailHTML({
          ownerName: owner.name || "—",
          ownerEmail: owner.email,
          amountBRL,
          curationTitle: curation.title || "",
          curationId: curation.id,
          paymentId: String(payment_id || curation.mercadopago_payment_id || "—"),
        }),
      });
      if (teamEmailErr) console.error("team email error", teamEmailErr);
    }

    return new Response(JSON.stringify({ success: true }), {
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
