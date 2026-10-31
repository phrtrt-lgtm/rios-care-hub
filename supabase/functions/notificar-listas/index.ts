// notificar-listas — WhatsApp ao responsável quando entra item novo em
// ajustes, compras ou tarefas_rua (CLAUDE.md §3.13–3.15).
//
// Chamada só pelo trigger trg_notificar_lista_whatsapp (pg_net), com o header
// x-internal-token conferido por public.verificar_token_interno (o mesmo
// token do Vault da notificar-cobranca). Corpo: { tabela, id }.
//
// Quem recebe vem de system_config 'listas_whatsapp':
//   ajustes            -> lista de { perfil, telefone? }
//   compras_rua/online -> idem, conforme compras.canal
//   tarefas_rua        -> o responsável da tarefa (tarefas_rua.responsavel_id)
// Quem criou o item não recebe aviso dele. O telefone do destino vale mais
// que o do perfil (o gestor não tem telefone no perfil).
//
// O envio passa pela central de WhatsApp (outro projeto), modelo genérico
// `notificacao_rios`: {{1}} nome, {{2}} referência, {{3}} texto.
// O resultado fica em <tabela>.notificacao_status / _em / _erro.
//
// Novo imóvel (CLAUDE.md §3.19, desde 2026-10-28): o cron
// disparar_avisos_viabilizacao manda { lote_email } com o mesmo token. A
// function junta os itens CONCLUÍDOS do lote num E-MAIL só ao proprietário
// (modelo `manutencao_concluida` de email_templates, endereço de
// viabilizacao_destino()), pula os que já viraram cobrança (a cobrança já
// avisou) e grava o resultado em viabilizacao_avisos.status. Nada de WhatsApp
// para o proprietário aqui: o gestor pediu só cobrança (como sempre) e o
// e-mail de conclusão, sem spam.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { getTemplate, renderTemplate } from "../_shared/template-renderer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-token",
};
const CENTRAL_URL = "https://gxsdefecwamziirfbzlk.supabase.co/functions/v1/notificar";
const TEMPLATE = "notificacao_rios";
const PORTAL = "portal.rioshospedagens.com.br";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABELAS = ["ajustes", "compras", "tarefas_rua"] as const;
type Tabela = (typeof TABELAS)[number];

const CATEGORIA: Record<string, string> = {
  anuncio: "Anúncio",
  ficha: "Ficha",
  mensagens: "Mensagens",
  roupa_de_cama: "Roupa de cama",
  sistema: "Sistema",
  outro: "Outro",
};
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const primeiroNome = (n?: string | null) => (n || "").trim().split(/\s+/)[0] || "equipe";
const nomeCurto = (n?: string | null) => (n || "").trim().split(/\s+/).slice(0, 2).join(" ") || "alguém da equipe";
// A Meta recusa parâmetro com quebra de linha, tabulação ou 4+ espaços seguidos.
const limpar = (t: string, max = 900) => t.replace(/\s+/g, " ").trim().slice(0, max);
const hojeBR = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

function dia(iso: string | null): string | null {
  if (!iso) return null;
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  const data = new Date(Date.UTC(a, m - 1, d));
  const hoje = hojeBR();
  if (iso.slice(0, 10) === hoje) return "hoje";
  return `${SEMANA[data.getUTCDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

interface Destino {
  perfil?: string;
  telefone?: string;
}

async function enviarCentral(chave: string, para: string, params: string[]) {
  try {
    const resp = await fetch(CENTRAL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-rios-key": chave },
      body: JSON.stringify({ template: TEMPLATE, params, para: [para] }),
    });
    const texto = await resp.text();
    let d: any = null;
    try { d = JSON.parse(texto); } catch { /* */ }
    const r = d?.resultados?.[0];
    if (resp.ok && r?.ok) return { ok: true, erro: null as string | null };
    const e = r?.erro || d?.error || d?.erro || `HTTP ${resp.status}: ${texto.slice(0, 300)}`;
    return { ok: false, erro: typeof e === "string" ? e : JSON.stringify(e) };
  } catch (e) {
    return { ok: false, erro: `Falha de rede: ${(e as Error).message}` };
  }
}

/* ------------------------------------------------------------------------ */
/* Novo imóvel: e-mail de conclusão ao proprietário (CLAUDE.md §3.19)         */
/* ------------------------------------------------------------------------ */

interface AvisoConclusao {
  id: string;
  viabilizacao_id: string;
  tipo: string;
  referencia: string | null;
  ticket_id: string | null;
}

interface DestinoEmail {
  nome: string | null;
  email: string | null;
  imovel: string | null;
}

const PORTAL_URL = `https://${PORTAL}/minha-caixa`;
const TEMPLATE_CONCLUSAO = "manutencao_concluida";

const escaparHtml = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Um e-mail para o lote: os itens concluídos do imóvel, cada ticket uma vez,
 * sem os que já têm cobrança lançada (o e-mail da cobrança já contou).
 */
// Cliente sem tipos de propósito: viabilizacoes/viabilizacao_avisos e a rpc
// viabilizacao_destino ainda não estão no types.ts gerado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClienteDB = SupabaseClient<any, any, any>;
async function enviarLoteEmail(supabase: ClienteDB, lote: string) {
  if (!UUID_RE.test(lote)) return json({ error: "lote_email inválido." }, 400);

  const { data: avisosData, error: erroAvisos } = await supabase
    .from("viabilizacao_avisos")
    .select("id, viabilizacao_id, tipo, referencia, ticket_id")
    .eq("lote_id", lote)
    .eq("status", "disparado")
    .order("created_at", { ascending: true });
  if (erroAvisos) return json({ error: erroAvisos.message }, 500);
  const avisos = (avisosData ?? []) as AvisoConclusao[];
  if (avisos.length === 0) return json({ status: "vazio", lote });

  const gravar = (status: string, erro: string | null = null, destino: string | null = null) =>
    supabase
      .from("viabilizacao_avisos")
      .update({ status, erro, destino, enviado_em: status === "enviado" ? new Date().toISOString() : null })
      .eq("lote_id", lote)
      .eq("status", "disparado");

  const { data: v } = await supabase
    .from("viabilizacoes")
    .select("id, nome, avisar_proprietario")
    .eq("id", avisos[0].viabilizacao_id)
    .maybeSingle();
  if (!v) {
    await gravar("falhou", "Registro do imóvel não encontrado.");
    return json({ status: "falhou", lote });
  }
  if (!v.avisar_proprietario) {
    await gravar("desligado");
    return json({ status: "desligado", lote });
  }

  // Item que já virou cobrança não entra: o e-mail da cobrança já avisou.
  const ticketIds = [...new Set(avisos.map((a) => a.ticket_id).filter((t): t is string => !!t))];
  const jaCobrados = new Set<string>();
  if (ticketIds.length > 0) {
    const { data: cobradas } = await supabase
      .from("charges")
      .select("ticket_id")
      .in("ticket_id", ticketIds)
      .neq("status", "draft")
      .is("archived_at", null);
    for (const c of cobradas ?? []) if (c.ticket_id) jaCobrados.add(c.ticket_id);
  }
  if (jaCobrados.size > 0) {
    await supabase
      .from("viabilizacao_avisos")
      .update({ status: "cobrado" })
      .eq("lote_id", lote)
      .eq("status", "disparado")
      .in("ticket_id", [...jaCobrados]);
  }
  const porTicket = new Map<string, AvisoConclusao>();
  for (const a of avisos) {
    if (a.ticket_id && jaCobrados.has(a.ticket_id)) continue;
    porTicket.set(a.ticket_id ?? a.id, a);
  }
  const itens = [...porTicket.values()].map((a) => (a.referencia || "Manutenção").trim());
  if (itens.length === 0) return json({ status: "cobrado", lote });

  const { data: destinoData } = await supabase.rpc("viabilizacao_destino", { p_id: v.id });
  const destino = (Array.isArray(destinoData) ? destinoData[0] : destinoData) as DestinoEmail | undefined;
  const email = (destino?.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    await gravar("sem_destino", "Sem e-mail do proprietário.");
    return json({ status: "sem_destino", lote });
  }

  const template = await getTemplate(supabase, TEMPLATE_CONCLUSAO);
  if (!template) {
    await gravar("falhou", `Modelo de e-mail "${TEMPLATE_CONCLUSAO}" não encontrado.`);
    return json({ status: "falhou", lote });
  }
  const chave = Deno.env.get("RESEND_API_KEY");
  if (!chave) {
    await gravar("falhou", "RESEND_API_KEY não configurada.");
    return json({ status: "falhou", lote });
  }

  const nome = (destino?.nome || "").trim() || "Proprietário";
  const imovel = (destino?.imovel || v.nome || "seu imóvel").trim();
  const quantidade = itens.length;
  const variables = {
    owner_name: nome,
    owner_first_name: nome.split(/\s+/)[0],
    property_name: imovel,
    quantidade,
    titulo: quantidade === 1 ? "Manutenção concluída" : `${quantidade} manutenções concluídas`,
    itens_html: itens.map((i) => `<li style="margin:0 0 8px 0;">${escaparHtml(i)}</li>`).join(""),
    itens_texto: itens.join(", "),
    portal_url: PORTAL_URL,
  };

  try {
    const resend = new Resend(chave);
    const { error } = await resend.emails.send({
      from: "RIOS <sistema@rioshospedagens.com.br>",
      reply_to: "rioslagoon@gmail.com",
      to: [email],
      subject: renderTemplate(template.subject, variables),
      html: renderTemplate(template.body_html, variables),
    });
    if (error) {
      const texto = typeof error === "string" ? error : (error as { message?: string }).message || JSON.stringify(error);
      await gravar("falhou", texto.slice(0, 500), email);
      return json({ status: "falhou", erro: texto, lote });
    }
  } catch (e) {
    const texto = `Falha ao enviar: ${(e as Error).message}`;
    await gravar("falhou", texto.slice(0, 500), email);
    return json({ status: "falhou", erro: texto, lote });
  }
  await gravar("enviado", null, email);
  return json({ status: "enviado", itens: quantidade, lote });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const token = req.headers.get("x-internal-token");
  if (!token) return json({ error: "Não autorizado." }, 401);
  const { data: valido, error: erroToken } = await supabase.rpc("verificar_token_interno", { p_token: token });
  if (erroToken || valido !== true) return json({ error: "Não autorizado." }, 401);

  let body: { tabela?: string; id?: string; lote_email?: string } = {};
  try { body = await req.json(); } catch { return json({ error: "Corpo inválido." }, 400); }
  if (body.lote_email !== undefined) {
    return await enviarLoteEmail(supabase, String(body.lote_email));
  }
  const tabela = body.tabela as Tabela;
  const id = String(body.id ?? "");
  if (!TABELAS.includes(tabela) || !UUID_RE.test(id)) return json({ error: "tabela e id obrigatórios." }, 400);

  const gravar = (status: string, erro: string | null = null) =>
    supabase.from(tabela).update({
      notificacao_status: status,
      notificacao_em: new Date().toISOString(),
      notificacao_erro: erro,
    }).eq("id", id);

  const { data: cfgRow } = await supabase.from("system_config").select("value").eq("key", "listas_whatsapp").maybeSingle();
  const cfg = (cfgRow?.value ?? {}) as Record<string, unknown>;
  if (!cfg.ativo) {
    await gravar("desativado");
    return json({ status: "desativado" });
  }

  const { data: item } = await supabase.from(tabela).select("*").eq("id", id).maybeSingle();
  if (!item) return json({ error: "Item não encontrado." }, 404);

  let imovel = "Geral";
  if (item.property_id) {
    const { data: p } = await supabase.from("properties").select("name").eq("id", item.property_id).maybeSingle();
    imovel = p?.name ?? "Imóvel";
  }
  const autor = nomeCurto(item.autor_nome);

  // Destinos e mensagem por tabela
  let destinos: Destino[] = [];
  let referencia = "";
  let texto = "";

  if (tabela === "ajustes") {
    destinos = (cfg.ajustes as Destino[]) ?? [];
    const cat = CATEGORIA[item.categoria] ?? "Ajuste";
    referencia = `${item.urgente ? "URGENTE · " : ""}Ajuste · ${cat} · ${imovel}`;
    texto = `${limpar(item.descricao, 600)} (avisado por ${autor}). Ver em ${PORTAL}/ajustes`;
  } else if (tabela === "compras") {
    const canal = item.canal === "online" ? "online" : "rua";
    destinos = (cfg[`compras_${canal}`] as Destino[]) ?? [];
    referencia = `Compra ${canal === "online" ? "online" : "na rua"} · ${imovel}`;
    const qtd = item.quantidade > 1 ? ` × ${item.quantidade}` : "";
    const link = item.link ? ` · ${item.link}` : "";
    texto = `${limpar(item.item, 200)}${qtd}${link} (pedido por ${autor}). Lista em ${PORTAL}/compras`;
  } else {
    destinos = item.responsavel_id ? [{ perfil: item.responsavel_id }] : [];
    referencia = `Tarefa de rua · ${imovel}`;
    let estado = "";
    if (item.property_id) {
      const { data: janelas } = await supabase.rpc("janela_imoveis");
      const j = (janelas as any[] | null)?.find((l) => l.property_id === item.property_id);
      if (j) {
        const co = dia(j.proximo_checkout);
        const entra = dia(j.proxima_entrada);
        if (!j.saida) estado = `Hoje: livre${entra ? ` até ${entra}` : ", sem reserva à frente"}`;
        else if (j.saida === hojeBR()) estado = `Hoje: hóspede sai hoje${entra ? `, entra outro ${entra}` : ""}`;
        else estado = "Hoje: ocupado";
        if (co) estado += `. Próximo check-out: ${co}`;
        estado += ". ";
      }
    }
    texto = `${limpar(item.descricao, 600)}. ${estado}Pedido por ${autor}. Ver em ${PORTAL}/tarefas-rua`;
  }

  // Quem criou não recebe; telefone do destino vale mais que o do perfil.
  const ids = destinos.map((d) => d.perfil).filter((p): p is string => !!p && UUID_RE.test(p));
  const perfis = new Map<string, { name: string | null; phone: string | null }>();
  if (ids.length > 0) {
    const { data } = await supabase.from("profiles").select("id, name, phone").in("id", ids);
    for (const p of data ?? []) perfis.set(p.id, { name: p.name, phone: p.phone });
  }
  const envios = destinos
    .filter((d) => !d.perfil || d.perfil !== item.autor_id)
    .map((d) => {
      const perfil = d.perfil ? perfis.get(d.perfil) : undefined;
      const telefone = String(d.telefone || perfil?.phone || "").replace(/\D/g, "");
      return { nome: primeiroNome(perfil?.name), telefone };
    })
    .filter((d) => d.telefone.length >= 10);

  if (envios.length === 0) {
    const proprio = destinos.some((d) => d.perfil && d.perfil === item.autor_id);
    await gravar(proprio ? "proprio_autor" : "sem_destino");
    return json({ status: proprio ? "proprio_autor" : "sem_destino" });
  }

  const chave = Deno.env.get("NOTIFICAR_KEY");
  if (!chave) {
    await gravar("falhou", "NOTIFICAR_KEY não configurada.");
    return json({ status: "falhou", erro: "NOTIFICAR_KEY não configurada." });
  }

  const resultados = await Promise.all(
    envios.map((e) => enviarCentral(chave, e.telefone, [limpar(e.nome, 60), limpar(referencia, 200), limpar(texto)])),
  );
  const falhas = resultados.filter((r) => !r.ok);
  if (falhas.length === 0) {
    await gravar("enviado");
    return json({ status: "enviado", enviados: resultados.length });
  }
  await gravar(falhas.length === resultados.length ? "falhou" : "parcial", falhas.map((f) => f.erro).join(" | ").slice(0, 500));
  return json({ status: "falhou", falhas });
});
