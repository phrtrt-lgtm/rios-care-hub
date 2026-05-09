import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { renderTemplate, getTemplate } from "../_shared/template-renderer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const PORTAL_URL = Deno.env.get("PORTAL_URL") || "https://portal.rioshospedagens.com.br";

function fmtBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

    let selectedItems: any[] = [];

    if (!test_email) {
      if (!curation_id) throw new Error("curation_id obrigatório");

      const { data: curation, error: curErr } = await admin
        .from("owner_curations")
        .select("id, owner_id, title, total_amount_cents, mercadopago_payment_id, selected_items")
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
      selectedItems = Array.isArray(curation.selected_items) ? curation.selected_items : [];
    } else {
      selectedItems = [
        { category: "Sala", name: "Tapete neutro 2x2,5m", price: "R$ 480" },
        { category: "Decoração", name: "Kit 4 almofadas linho", price: "R$ 360" },
      ];
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

    // Buscar templates do banco (editáveis em /configuracao-email)
    const ownerTpl = await getTemplate(admin, "curation_paid_owner");
    const teamTpl = await getTemplate(admin, "curation_paid_team");

    // 1) Email pra proprietária (ou pro tester)
    if (ownerTpl) {
      const ownerVars = {
        owner_first_name: ownerFirst,
        owner_name: ownerName,
        amount: amountBRL,
        curation_title: curationTitle,
        portal_url: `${PORTAL_URL}/login`,
      };
      const subject = renderTemplate(ownerTpl.subject, ownerVars);
      const html = renderTemplate(ownerTpl.body_html, ownerVars);
      const { error: ownerEmailErr } = await resend.emails.send({
        from: "RIOS <sistema@rioshospedagens.com.br>",
        reply_to: "rioslagoon@gmail.com",
        to: [ownerRecipient],
        subject: isTest ? `[TESTE proprietária] ${subject}` : subject,
        html,
      });
      if (ownerEmailErr) console.error("owner email error", ownerEmailErr);
    } else {
      console.error("Template curation_paid_owner não encontrado");
    }

    // 2) Email pra equipe
    if (adminEmails.length > 0 && teamTpl) {
      const teamVars = {
        owner_name: ownerName,
        owner_email: ownerEmail,
        amount: amountBRL,
        curation_title: curationTitle || "—",
        curation_id_short: resolvedCurationId.slice(0, 8),
        payment_id: resolvedPaymentId,
        admin_url: `${PORTAL_URL}/admin/cadastros-proprietarios`,
      };
      const subject = renderTemplate(teamTpl.subject, teamVars);
      const html = renderTemplate(teamTpl.body_html, teamVars);
      const { error: teamEmailErr } = await resend.emails.send({
        from: "RIOS <sistema@rioshospedagens.com.br>",
        to: adminEmails,
        subject: isTest ? `[TESTE equipe] ${subject}` : subject,
        html,
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
