// notificar-lead — WhatsApp ao lead do pré-cadastro de imóvel e aviso à equipe.
// Chamada pelo trigger trg_notificar_lead_whatsapp (sem token, body {id}) ou por
// admin (reenviar). Sem admin, envia ao lead só se ainda não foi enviado.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { exigirPapel } from "../_shared/auth-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const CENTRAL_URL = "https://gxsdefecwamziirfbzlk.supabase.co/functions/v1/notificar";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const primeiroNome = (n?: string | null) => (n || "").trim().split(/\s+/)[0] || "Proprietário";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function enviarCentral(chave: string | undefined, payload: unknown) {
  if (!chave) return { ok: false, id: null as string | null, erro: "NOTIFICAR_KEY não configurada." };
  try {
    const resp = await fetch(CENTRAL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-rios-key": chave },
      body: JSON.stringify(payload),
    });
    const texto = await resp.text();
    let d: any = null; try { d = JSON.parse(texto); } catch { /* */ }
    const res = d?.resultados?.[0];
    if (resp.ok && res?.ok) return { ok: true, id: (res.id ?? null) as string | null, erro: null };
    const e = res?.erro || d?.error || d?.erro || `HTTP ${resp.status}: ${texto.slice(0, 300)}`;
    return { ok: false, id: null, erro: typeof e === "string" ? e : JSON.stringify(e) };
  } catch (e) {
    return { ok: false, id: null, erro: `Falha de rede: ${(e as Error).message}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  let body: { id?: string; reenviar?: boolean } = {};
  try { body = await req.json(); } catch { return json({ error: "Corpo inválido." }, 400); }
  const id = String(body.id ?? "").trim();
  if (!UUID_RE.test(id)) return json({ error: "id obrigatório." }, 400);

  let admin = false;
  if ((req.headers.get("authorization") ?? "").length > 0 && body.reenviar) {
    const { resposta } = await exigirPapel(req, ["admin"], corsHeaders);
    if (resposta) return resposta;
    admin = true;
  } else if (body.reenviar) {
    return json({ error: "Não autorizado." }, 401);
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: s } = await supabase
    .from("property_intake_submissions")
    .select("id, owner_name, owner_phone, property_nickname, property_address, bedrooms_count, utm, whatsapp_lead_status")
    .eq("id", id).maybeSingle();
  if (!s) return json({ error: "Cadastro não encontrado." }, 404);
  if (!admin && s.whatsapp_lead_status === "enviado") return json({ status: "ja_enviado" });

  const gravar = (campos: Record<string, unknown>) =>
    supabase.from("property_intake_submissions").update(campos).eq("id", id);

  const { data: cfgRow } = await supabase.from("system_config").select("value").eq("key", "leads_whatsapp").maybeSingle();
  const cfg = (cfgRow?.value ?? {}) as { ativo?: boolean; avisar_equipe?: string[]; template_lead?: string };
  if (!cfg.ativo) {
    await gravar({ whatsapp_lead_status: "pendente" });
    return json({ status: "pendente" });
  }

  const chave = Deno.env.get("NOTIFICAR_KEY");
  const descricaoImovel = (s.property_nickname || "").trim() || (s.property_address || "").trim().slice(0, 60) || "Cabo Frio";

  // Lead
  let tel = (s.owner_phone || "").replace(/\D/g, "");
  if ((tel.length === 12 || tel.length === 13) && tel.startsWith("55")) tel = tel.slice(2);
  let lead: Record<string, unknown>;
  if (tel.length < 10) {
    await gravar({ whatsapp_lead_status: "sem_telefone", whatsapp_lead_erro: "Sem WhatsApp válido." });
    lead = { status: "sem_telefone" };
  } else {
    const r = await enviarCentral(chave, {
      template: cfg.template_lead || "cadastro_recebido",
      params: [primeiroNome(s.owner_name), descricaoImovel],
      para: [tel],
    });
    if (r.ok) {
      await gravar({ whatsapp_lead_status: "enviado", whatsapp_lead_enviado_em: new Date().toISOString(), whatsapp_lead_message_id: r.id, whatsapp_lead_erro: null });
      lead = { status: "enviado", message_id: r.id };
    } else {
      await gravar({ whatsapp_lead_status: "falhou", whatsapp_lead_erro: r.erro });
      lead = { status: "falhou", erro: r.erro };
    }
  }

  // Equipe
  let equipe: Record<string, unknown> = { status: "ignorado" };
  const numeros = Array.isArray(cfg.avisar_equipe) ? cfg.avisar_equipe.filter((n) => typeof n === "string" && n.trim()) : [];
  if (numeros.length > 0) {
    const utm = (s.utm ?? {}) as { utm_content?: string };
    const texto = (`${s.owner_name} · ${s.owner_phone ?? ""} · ${descricaoImovel} · ${s.bedrooms_count ?? "?"} qts` +
      (utm?.utm_content ? ` · anúncio: ${utm.utm_content}` : "")).slice(0, 900);
    const r = await enviarCentral(chave, { template: "notificacao_rios", params: ["equipe", "Novo lead do site", texto], para: numeros });
    await gravar({ whatsapp_equipe_status: r.ok ? "enviado" : "falhou" });
    equipe = r.ok ? { status: "enviado" } : { status: "falhou", erro: r.erro };
  }

  return json({ status: lead.status, lead, equipe });
});
