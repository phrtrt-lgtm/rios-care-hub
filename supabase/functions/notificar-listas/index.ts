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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const token = req.headers.get("x-internal-token");
  if (!token) return json({ error: "Não autorizado." }, 401);
  const { data: valido, error: erroToken } = await supabase.rpc("verificar_token_interno", { p_token: token });
  if (erroToken || valido !== true) return json({ error: "Não autorizado." }, 401);

  let body: { tabela?: string; id?: string } = {};
  try { body = await req.json(); } catch { return json({ error: "Corpo inválido." }, 400); }
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
