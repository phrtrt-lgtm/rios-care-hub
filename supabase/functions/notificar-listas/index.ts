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
// disparar_avisos_viabilizacao manda { lote_viabilizacao } com o mesmo token.
// A function junta os avisos do lote (etapa, visita, estreia, itens novos e
// feitos, cobranças enviadas) numa mensagem só ao PROPRIETÁRIO, com o telefone
// de viabilizacao_destino(), e grava o resultado em viabilizacao_avisos.status.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

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
/* Novo imóvel: lote de avisos ao proprietário (CLAUDE.md §3.19)              */
/* ------------------------------------------------------------------------ */

type TipoAviso = "etapa" | "visita" | "estreia" | "item_novo" | "item_feito" | "item_enviado";

interface AvisoViabilizacao {
  id: string;
  viabilizacao_id: string;
  tipo: TipoAviso;
  referencia: string | null;
  ticket_id: string | null;
  valor_cents: number | null;
}

interface ViabilizacaoParaAviso {
  id: string;
  nome: string;
  etapa: string;
  visita_em: string | null;
  estreia_prevista: string | null;
  avisar_proprietario: boolean;
}

interface DestinoViabilizacao {
  nome: string | null;
  telefone: string | null;
  imovel: string | null;
  tem_conta: boolean;
}

const PESO_ITEM: Record<string, number> = { item_novo: 1, item_feito: 2, item_enviado: 3 };

const brl = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

/** Até `max` nomes; o resto vira "e mais N". */
function listar(nomes: string[], max = 4): string {
  const limpos = nomes.map((n) => limpar(n, 80)).filter(Boolean);
  const inicio = limpos.slice(0, max).join(", ");
  return limpos.length > max ? `${inicio} e mais ${limpos.length - max}` : inicio;
}

/** A frase da etapa já leva a visita e a estreia do registro. */
function fraseEtapa(etapa: string, v: ViabilizacaoParaAviso): string | null {
  const estreia = v.estreia_prevista ? `, com estreia prevista para ${dia(v.estreia_prevista)}` : "";
  switch (etapa) {
    case "visita":
      return v.visita_em
        ? `Visita marcada para ${dia(v.visita_em)}, para levantar o que precisa ser feito`
        : "Vamos marcar a visita em breve, para levantar o que precisa ser feito";
    case "preparacao":
      return `O imóvel entrou em preparação (consertos, compras e montagem)${estreia}`;
    case "pronto":
      return `Tudo pronto no imóvel! Agora é fotografar e publicar o anúncio${estreia}`;
    case "no_ar":
      return "O anúncio foi publicado: o imóvel está no ar e já pode receber reservas";
    default:
      return null;
  }
}

/**
 * Uma mensagem para o lote inteiro: a última etapa (ou visita/estreia soltas),
 * depois os itens, cada item uma vez no estado mais adiantado
 * (enviado > feito > novo).
 */
function montarTextoViabilizacao(v: ViabilizacaoParaAviso, avisos: AvisoViabilizacao[], temConta: boolean): string {
  const frases: string[] = [];
  const etapas = avisos.filter((a) => a.tipo === "etapa");
  const ultimaEtapa = etapas[etapas.length - 1];
  if (ultimaEtapa?.referencia) {
    const f = fraseEtapa(ultimaEtapa.referencia, v);
    if (f) frases.push(f);
  } else {
    const visita = avisos.filter((a) => a.tipo === "visita").pop();
    if (visita?.referencia) frases.push(`Visita marcada para ${dia(visita.referencia)}`);
    const estreia = avisos.filter((a) => a.tipo === "estreia").pop();
    if (estreia?.referencia) frases.push(`Estreia prevista para ${dia(estreia.referencia)}`);
  }

  const porItem = new Map<string, AvisoViabilizacao>();
  for (const a of avisos) {
    if (!(a.tipo in PESO_ITEM)) continue;
    const chave = a.ticket_id ?? a.id;
    const atual = porItem.get(chave);
    if (!atual || PESO_ITEM[a.tipo] >= PESO_ITEM[atual.tipo]) porItem.set(chave, a);
  }
  const itens = [...porItem.values()];
  const novos = itens.filter((a) => a.tipo === "item_novo").map((a) => a.referencia || "item");
  const feitos = itens.filter((a) => a.tipo === "item_feito").map((a) => a.referencia || "item");
  const enviados = itens.filter((a) => a.tipo === "item_enviado");
  if (novos.length > 0) {
    frases.push(`${novos.length === 1 ? "Entrou na lista do que fazer" : `Entraram na lista do que fazer (${novos.length})`}: ${listar(novos)}`);
  }
  if (feitos.length > 0) {
    frases.push(`${feitos.length === 1 ? "Concluído" : `Concluídos (${feitos.length})`}: ${listar(feitos)}`);
  }
  if (enviados.length > 0) {
    const nomes = enviados.map((a) => {
      const ref = a.referencia || "item";
      if (a.valor_cents === null || a.valor_cents === undefined) return ref;
      return a.valor_cents > 0 ? `${ref} (${brl(a.valor_cents)})` : `${ref} (por conta da RIOS)`;
    });
    frases.push(`${enviados.length === 1 ? "Cobrança enviada" : `Cobranças enviadas (${enviados.length})`}: ${listar(nomes)}`);
  }
  if (frases.length === 0) return "";
  let texto = `${frases.join(". ")}.`;
  if (temConta) texto += ` Acompanhe em ${PORTAL}.`;
  return texto;
}

async function enviarLoteViabilizacao(supabase: ReturnType<typeof createClient>, lote: string) {
  if (!UUID_RE.test(lote)) return json({ error: "lote_viabilizacao inválido." }, 400);

  const { data: avisosData, error: erroAvisos } = await supabase
    .from("viabilizacao_avisos")
    .select("id, viabilizacao_id, tipo, referencia, ticket_id, valor_cents")
    .eq("lote_id", lote)
    .eq("status", "disparado")
    .order("created_at", { ascending: true });
  if (erroAvisos) return json({ error: erroAvisos.message }, 500);
  const avisos = (avisosData ?? []) as AvisoViabilizacao[];
  if (avisos.length === 0) return json({ status: "vazio", lote });

  const gravar = (status: string, erro: string | null = null, telefone: string | null = null) =>
    supabase
      .from("viabilizacao_avisos")
      .update({ status, erro, telefone, enviado_em: status === "enviado" ? new Date().toISOString() : null })
      .eq("lote_id", lote)
      .eq("status", "disparado");

  const { data: v } = await supabase
    .from("viabilizacoes")
    .select("id, nome, etapa, visita_em, estreia_prevista, avisar_proprietario")
    .eq("id", avisos[0].viabilizacao_id)
    .maybeSingle();
  if (!v) {
    await gravar("falhou", "Registro do imóvel não encontrado.");
    return json({ status: "falhou", lote });
  }
  const viab = v as ViabilizacaoParaAviso;
  if (!viab.avisar_proprietario) {
    await gravar("desligado");
    return json({ status: "desligado", lote });
  }

  const { data: destinoData } = await supabase.rpc("viabilizacao_destino", { p_id: viab.id });
  const destino = (Array.isArray(destinoData) ? destinoData[0] : destinoData) as DestinoViabilizacao | undefined;
  if (!destino?.telefone) {
    await gravar("sem_destino", "Sem WhatsApp do proprietário.");
    return json({ status: "sem_destino", lote });
  }

  const texto = montarTextoViabilizacao(viab, avisos, !!destino.tem_conta);
  if (!texto) {
    await gravar("falhou", "Nada a enviar.");
    return json({ status: "falhou", lote });
  }

  const chave = Deno.env.get("NOTIFICAR_KEY");
  if (!chave) {
    await gravar("falhou", "NOTIFICAR_KEY não configurada.");
    return json({ status: "falhou", erro: "NOTIFICAR_KEY não configurada.", lote });
  }

  const nome = (destino.nome || "").trim().split(/\s+/)[0] || "Proprietário";
  const r = await enviarCentral(chave, destino.telefone, [
    limpar(nome, 60),
    limpar(`Imóvel ${destino.imovel || viab.nome}`, 200),
    limpar(texto),
  ]);
  await gravar(r.ok ? "enviado" : "falhou", r.erro, destino.telefone);
  return json({ status: r.ok ? "enviado" : "falhou", erro: r.erro, lote });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const token = req.headers.get("x-internal-token");
  if (!token) return json({ error: "Não autorizado." }, 401);
  const { data: valido, error: erroToken } = await supabase.rpc("verificar_token_interno", { p_token: token });
  if (erroToken || valido !== true) return json({ error: "Não autorizado." }, 401);

  let body: { tabela?: string; id?: string; lote_viabilizacao?: string } = {};
  try { body = await req.json(); } catch { return json({ error: "Corpo inválido." }, 400); }
  if (body.lote_viabilizacao !== undefined) {
    return await enviarLoteViabilizacao(supabase, String(body.lote_viabilizacao));
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
