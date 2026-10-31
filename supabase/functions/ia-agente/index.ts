// ia-agente — o assistente do portal (PLANO_IA_AGENTE.md §2.3, §2.4).
//
// Corpo: { mensagem, conversa_id?, pagina? }  → responde e, se o modelo pediu
//        uma ação de escrita, devolve `acao_pendente` para a tela confirmar;
//        { confirmar: <acao_id> } ou { cancelar: <acao_id> } → retoma a conversa.
//
// Quem chama: equipe e, quando a configuração liberar, proprietário. O papel
// vem do token (exigirPapel). Tudo que o modelo lê passa pelo JWT do usuário
// (RLS) e pela política (_shared/ia/politica.ts). Tudo fica em
// ia_conversas / ia_mensagens / ia_acoes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { exigirPapel } from "../_shared/auth-guard.ts";
import {
  type Bloco,
  type Mensagem,
  ErroIA,
  blocosToolUse,
  chamarClaude,
  normalizarEffort,
  normalizarModelo,
  textoDe,
  textoDeRecusa,
  usoDe,
} from "../_shared/ia/claude.ts";
import {
  type Contexto,
  type FerramentaIA,
  type Papel,
  ErroFerramenta,
  LIMITES,
  PAPEIS_EQUIPE,
  agoraBrasilia,
  comTimeout,
  ehUuid,
  ferramentasPara,
  hojeBrasilia,
  lerConfig,
  paraClaude,
} from "../_shared/ia/politica.ts";
import { CATALOGO } from "../_shared/ia/ferramentas.ts";
import { systemFixo, systemVariavel } from "../_shared/ia/prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Linha = Record<string, unknown>;

interface Corpo {
  mensagem?: unknown;
  conversa_id?: unknown;
  pagina?: { rota?: unknown } | null;
  confirmar?: unknown;
  cancelar?: unknown;
}

interface AcaoPendente {
  id: string;
  ferramenta: string;
  resumo: string;
  entrada: Record<string, unknown>;
}

interface RespostaAgente {
  conversa_id: string;
  mensagem_id: string | null;
  texto: string;
  acao_pendente?: AcaoPendente;
  /** Ferramentas de leitura executadas nesta resposta (para o widget mostrar "Consultou: …"). */
  ferramentas_usadas: string[];
  fim: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const { autor, resposta } = await exigirPapel(
    req,
    ["admin", "agent", "maintenance", "owner", "cleaner"],
    corsHeaders,
  );
  if (resposta) return resposta;
  if (!autor) return json({ error: "Não autenticado." }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const adminClient = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("authorization")! } },
  });

  const { data: cfgRow } = await adminClient.from("system_config").select("value").eq("key", "ia_agente").maybeSingle();
  const config = lerConfig(cfgRow?.value);
  if (!config.ativo) return json({ error: "O assistente está desligado no momento." }, 503);
  if (!config.papeis[autor.role]) return json({ error: "O assistente ainda não está liberado para o seu perfil." }, 403);

  const corpo = (await req.json().catch(() => ({}))) as Corpo;
  const { data: perfil } = await adminClient.from("profiles").select("name").eq("id", autor.id).maybeSingle();

  const ctx: Contexto = {
    uid: autor.id,
    papel: autor.role as Papel,
    nome: (perfil?.name as string | undefined) ?? "",
    equipe: PAPEIS_EQUIPE.includes(autor.role as Papel),
    userClient,
    adminClient,
    hoje: hojeBrasilia(),
    agora: agoraBrasilia(),
    pagina: typeof corpo.pagina?.rota === "string" ? { rota: corpo.pagina.rota.slice(0, 200) } : undefined,
    config,
  };

  try {
    if (ehUuid(corpo.confirmar)) return json(await retomar(ctx, corpo.confirmar, "confirmar"));
    if (ehUuid(corpo.cancelar)) return json(await retomar(ctx, corpo.cancelar, "cancelar"));
    if (typeof corpo.mensagem === "string" && corpo.mensagem.trim()) return json(await conversar(ctx, corpo));
    return json({ error: "Pedido inválido: envie `mensagem` ou `confirmar`/`cancelar`." }, 400);
  } catch (e) {
    if (e instanceof ErroIA) return json({ error: e.message }, e.status);
    console.error("[ia-agente]", e);
    return json({ error: "Erro interno do assistente." }, 500);
  }
});

// ---------------------------------------------------------------- cotas

async function conferirCotas(ctx: Contexto): Promise<void> {
  const umaHoraAtras = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await ctx.adminClient
    .from("ia_mensagens")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", ctx.uid)
    .eq("role", "user")
    .not("texto", "is", null)
    .gte("criada_em", umaHoraAtras);
  const limite = ctx.equipe ? ctx.config.cotas.mensagens_por_hora_equipe : ctx.config.cotas.mensagens_por_hora_proprietario;
  if ((count ?? 0) >= limite) {
    throw new ErroIA(429, `Você chegou ao limite de ${limite} mensagens por hora. Tente de novo mais tarde.`);
  }

  const umDiaAtras = new Date(Date.now() - 86400_000).toISOString();
  const { data } = await ctx.adminClient
    .from("ia_mensagens")
    .select("tokens_entrada, tokens_saida")
    .eq("usuario_id", ctx.uid)
    .eq("role", "assistant")
    .gte("criada_em", umDiaAtras)
    .limit(2000);
  const tokens = ((data ?? []) as Linha[]).reduce(
    (s, m) => s + Number(m.tokens_entrada ?? 0) + Number(m.tokens_saida ?? 0),
    0,
  );
  if (tokens >= ctx.config.cotas.tokens_por_dia) {
    throw new ErroIA(429, "Você chegou ao limite diário de uso do assistente. Volte amanhã.");
  }
}

// ------------------------------------------------------------- conversa

interface Conversa {
  id: string;
}

async function conversar(ctx: Contexto, corpo: Corpo): Promise<RespostaAgente> {
  const texto = String(corpo.mensagem).trim().slice(0, 4000);
  await conferirCotas(ctx);

  let conversa: Conversa;
  if (ehUuid(corpo.conversa_id)) {
    const { data } = await ctx.adminClient
      .from("ia_conversas")
      .select("id, encerrada_em")
      .eq("id", corpo.conversa_id)
      .eq("usuario_id", ctx.uid)
      .maybeSingle();
    if (!data) throw new ErroIA(404, "Conversa não encontrada.");
    conversa = { id: data.id as string };
  } else {
    const { data, error } = await ctx.adminClient
      .from("ia_conversas")
      .insert({
        usuario_id: ctx.uid,
        papel: ctx.papel,
        pagina_inicial: ctx.pagina?.rota ?? null,
        titulo: texto.slice(0, 80),
      })
      .select("id")
      .single();
    if (error || !data) throw new ErroIA(500, "Não consegui abrir a conversa.");
    conversa = { id: data.id as string };
  }

  const { data: pendentes } = await ctx.adminClient
    .from("ia_acoes")
    .select("id")
    .eq("conversa_id", conversa.id)
    .eq("status", "aguardando_confirmacao")
    .limit(1);
  if ((pendentes ?? []).length > 0) {
    throw new ErroIA(409, "Há uma ação esperando sua confirmação. Confirme ou cancele antes de continuar.");
  }

  const { messages, ordem } = await carregarHistorico(ctx, conversa.id);
  if (messages.length >= LIMITES.historicoMax) {
    throw new ErroIA(400, "Esta conversa ficou longa. Comece uma conversa nova.");
  }

  const blocoUsuario: Mensagem = { role: "user", content: [{ type: "text", text: texto }] };
  messages.push(blocoUsuario);
  let proximaOrdem = ordem + 1;
  await gravarMensagem(ctx, conversa.id, proximaOrdem, "user", blocoUsuario.content, texto);

  return laco(ctx, conversa, messages, proximaOrdem);
}

async function carregarHistorico(ctx: Contexto, conversaId: string): Promise<{ messages: Mensagem[]; ordem: number }> {
  const { data, error } = await ctx.adminClient
    .from("ia_mensagens")
    .select("ordem, role, blocos")
    .eq("conversa_id", conversaId)
    .order("ordem", { ascending: true })
    .limit(LIMITES.historicoMax + 5);
  if (error) throw new ErroIA(500, "Não consegui ler a conversa.");
  const linhas = (data ?? []) as Linha[];
  const messages: Mensagem[] = linhas.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.blocos as Mensagem["content"],
  }));
  const ordem = linhas.length ? Number(linhas[linhas.length - 1].ordem) : 0;
  return { messages, ordem };
}

interface UsoGravado {
  modelo?: string;
  effort?: string;
  stop_reason?: string | null;
  tokens_entrada?: number;
  tokens_saida?: number;
  tokens_cache_lidos?: number;
  tokens_cache_gravados?: number;
  latencia_ms?: number;
  custo_estimado_microusd?: number;
}

async function gravarMensagem(
  ctx: Contexto,
  conversaId: string,
  ordem: number,
  role: "user" | "assistant",
  blocos: unknown,
  texto: string | null,
  uso: UsoGravado = {},
): Promise<string> {
  const { data, error } = await ctx.adminClient
    .from("ia_mensagens")
    .insert({ conversa_id: conversaId, usuario_id: ctx.uid, ordem, role, blocos, texto, ...uso })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[ia-agente] gravar mensagem:", error?.message);
    throw new ErroIA(500, "Não consegui guardar a conversa.");
  }
  await ctx.adminClient.from("ia_conversas").update({ atualizada_em: new Date().toISOString() }).eq("id", conversaId);
  return data.id as string;
}

async function imoveisDoContexto(ctx: Contexto): Promise<Array<{ id: string; name: string }>> {
  const { data } = await ctx.userClient
    .from("properties")
    .select("id, name")
    .is("archived_at", null)
    .order("name")
    .limit(90);
  return ((data ?? []) as Array<{ id: string; name: string }>);
}

// ------------------------------------------------------------------ laço

async function laco(ctx: Contexto, conversa: Conversa, messages: Mensagem[], ordem: number): Promise<RespostaAgente> {
  const ferramentas = ferramentasPara(ctx.papel, ctx.config, CATALOGO);
  const tools = ferramentas.map(paraClaude);
  const imoveis = await imoveisDoContexto(ctx);
  const modelo = normalizarModelo(ctx.config.modelo);
  const effort = normalizarEffort(ctx.config.effort);
  let ultimaMensagemId: string | null = null;
  const usadas: string[] = [];

  for (let rodada = 0; rodada < LIMITES.iteracoes; rodada++) {
    const t0 = Date.now();
    const r = await chamarClaude({
      systemFixo: systemFixo(ctx.papel),
      systemVariavel: systemVariavel(ctx, imoveis),
      tools,
      messages,
      modelo,
      effort,
      maxTokens: 4000,
    });
    const texto = textoDe(r.content);
    ordem += 1;
    ultimaMensagemId = await gravarMensagem(ctx, conversa.id, ordem, "assistant", r.content, texto || null, {
      modelo: r.model,
      effort,
      stop_reason: r.stop_reason,
      latencia_ms: Date.now() - t0,
      ...usoDe(r),
    });
    messages.push({ role: "assistant", content: r.content as unknown as Mensagem["content"] });

    if (r.stop_reason === "refusal") {
      return { conversa_id: conversa.id, mensagem_id: ultimaMensagemId, texto: textoDeRecusa(r), ferramentas_usadas: usadas, fim: true };
    }

    const usos = blocosToolUse(r);
    if (usos.length === 0) {
      const final = r.stop_reason === "max_tokens"
        ? `${texto}\n\n(A resposta foi cortada por tamanho. Peça a continuação.)`
        : texto || "Não tenho nada a acrescentar.";
      return { conversa_id: conversa.id, mensagem_id: ultimaMensagemId, texto: final, ferramentas_usadas: usadas, fim: true };
    }

    const resultados: Bloco[] = [];
    let pendente: AcaoPendente | null = null;
    for (const u of usos) {
      const saida = await tratarToolUse(ctx, conversa.id, ultimaMensagemId, u, ferramentas, pendente !== null);
      if (saida.usada) usadas.push(saida.usada);
      if (saida.pendente) pendente = saida.pendente;
      else resultados.push(saida.bloco as unknown as Bloco);
    }
    if (pendente) {
      // As leituras desta rodada já foram executadas e guardadas em ia_acoes;
      // a retomada remonta a mensagem de resultados a partir delas.
      return {
        conversa_id: conversa.id,
        mensagem_id: ultimaMensagemId,
        texto,
        acao_pendente: pendente,
        ferramentas_usadas: usadas,
        fim: false,
      };
    }

    ordem += 1;
    await gravarMensagem(ctx, conversa.id, ordem, "user", resultados, null);
    messages.push({ role: "user", content: resultados as unknown as Mensagem["content"] });
  }

  return {
    conversa_id: conversa.id,
    mensagem_id: ultimaMensagemId,
    texto: "Precisei de passos demais para responder. Tente dividir o pedido em partes menores.",
    ferramentas_usadas: usadas,
    fim: true,
  };
}

interface ToolUse {
  id: string;
  name: string;
  input: unknown;
}

interface SaidaToolUse {
  bloco?: { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
  pendente?: AcaoPendente;
  /** Nome da ferramenta de leitura executada com sucesso. */
  usada?: string;
}

function cortar(texto: string): string {
  return texto.length > LIMITES.resultadoChars
    ? `${texto.slice(0, LIMITES.resultadoChars)}\n…(resultado cortado em ${LIMITES.resultadoChars} caracteres; peça um filtro mais estreito)`
    : texto;
}

function resultadoParaLog(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return { texto };
  }
}

async function tratarToolUse(
  ctx: Contexto,
  conversaId: string,
  mensagemId: string | null,
  u: ToolUse,
  permitidas: FerramentaIA[],
  jaTemPendente: boolean,
): Promise<SaidaToolUse> {
  const entrada = (u.input && typeof u.input === "object" ? u.input : {}) as Record<string, unknown>;
  const f = permitidas.find((x) => x.nome === u.name);
  const propertyId = f?.imovelParam && ehUuid(entrada[f.imovelParam]) ? (entrada[f.imovelParam] as string) : null;

  const base = {
    conversa_id: conversaId,
    mensagem_id: mensagemId,
    tool_use_id: u.id,
    usuario_id: ctx.uid,
    papel: ctx.papel,
    ferramenta: u.name,
    property_id: propertyId,
    entrada,
  };

  if (!f) {
    const existe = CATALOGO.some((x) => x.nome === u.name);
    const motivo = existe ? "Ferramenta não permitida para este perfil." : "Ferramenta desconhecida.";
    await ctx.adminClient.from("ia_acoes").insert({ ...base, nivel: "leitura", status: "negada", motivo_negada: motivo });
    return { bloco: { type: "tool_result", tool_use_id: u.id, content: motivo, is_error: true } };
  }

  if (f.nivel === "escrita") {
    if (jaTemPendente) {
      const motivo = "Só uma ação de escrita por vez: espere a confirmação da anterior.";
      await ctx.adminClient.from("ia_acoes").insert({ ...base, nivel: "escrita", status: "negada", motivo_negada: motivo });
      return { bloco: { type: "tool_result", tool_use_id: u.id, content: motivo, is_error: true } };
    }
    const resumo = f.resumo?.(entrada) ?? f.nome;
    const { data, error } = await ctx.adminClient
      .from("ia_acoes")
      .insert({ ...base, nivel: "escrita", status: "aguardando_confirmacao", resumo })
      .select("id")
      .single();
    if (error || !data) throw new ErroIA(500, "Não consegui registrar a ação para confirmação.");
    return { pendente: { id: data.id as string, ferramenta: f.nome, resumo, entrada } };
  }

  const t0 = Date.now();
  try {
    const resultado = await comTimeout(f.executar(ctx, entrada));
    const texto = cortar(JSON.stringify(resultado ?? null));
    await ctx.adminClient.from("ia_acoes").insert({
      ...base,
      nivel: "leitura",
      status: "executada",
      resultado: resultadoParaLog(texto),
      executada_em: new Date().toISOString(),
      duracao_ms: Date.now() - t0,
    });
    return { bloco: { type: "tool_result", tool_use_id: u.id, content: texto }, usada: f.nome };
  } catch (e) {
    const msg = e instanceof ErroFerramenta ? e.message : "Erro ao executar a consulta.";
    if (!(e instanceof ErroFerramenta)) console.error(`[ia-agente] ${u.name}:`, e);
    await ctx.adminClient.from("ia_acoes").insert({
      ...base,
      nivel: "leitura",
      status: "erro",
      erro: msg,
      duracao_ms: Date.now() - t0,
    });
    return { bloco: { type: "tool_result", tool_use_id: u.id, content: msg, is_error: true } };
  }
}

// -------------------------------------------------------------- retomada

async function retomar(ctx: Contexto, acaoId: string, decisao: "confirmar" | "cancelar"): Promise<RespostaAgente> {
  const { data: acao } = await ctx.adminClient
    .from("ia_acoes")
    .select("id, conversa_id, mensagem_id, tool_use_id, ferramenta, entrada, status, criada_em")
    .eq("id", acaoId)
    .eq("usuario_id", ctx.uid)
    .maybeSingle();
  if (!acao) throw new ErroIA(404, "Ação não encontrada.");
  if (acao.status !== "aguardando_confirmacao") throw new ErroIA(409, "Essa ação já foi tratada.");
  if (!acao.conversa_id || !acao.mensagem_id || !acao.tool_use_id) throw new ErroIA(500, "Ação sem conversa.");

  const idade = Date.now() - new Date(acao.criada_em as string).getTime();
  const expirou = idade > LIMITES.confirmacaoMin * 60_000;

  let conteudo: string;
  let erro = false;
  if (expirou) {
    await ctx.adminClient.from("ia_acoes").update({ status: "expirada" }).eq("id", acao.id);
    conteudo = "A confirmação expirou e a ação não foi executada. Peça de novo se ainda quiser.";
    erro = true;
  } else if (decisao === "cancelar") {
    await ctx.adminClient.from("ia_acoes").update({ status: "cancelada" }).eq("id", acao.id);
    conteudo = "O usuário cancelou esta ação. Não execute nada; pergunte se quer algo diferente.";
    erro = true;
  } else {
    const f = ferramentasPara(ctx.papel, ctx.config, CATALOGO).find((x) => x.nome === acao.ferramenta);
    if (!f) {
      await ctx.adminClient.from("ia_acoes").update({ status: "negada", motivo_negada: "Ferramenta não permitida." }).eq("id", acao.id);
      conteudo = "Ferramenta não permitida para este perfil.";
      erro = true;
    } else {
      const t0 = Date.now();
      try {
        const resultado = await comTimeout(f.executar(ctx, (acao.entrada ?? {}) as Record<string, unknown>));
        conteudo = cortar(JSON.stringify(resultado ?? null));
        await ctx.adminClient.from("ia_acoes").update({
          status: "executada",
          confirmada_em: new Date().toISOString(),
          executada_em: new Date().toISOString(),
          duracao_ms: Date.now() - t0,
          resultado: resultadoParaLog(conteudo),
        }).eq("id", acao.id);
      } catch (e) {
        conteudo = e instanceof ErroFerramenta ? e.message : "Erro ao executar a ação.";
        if (!(e instanceof ErroFerramenta)) console.error(`[ia-agente] ${acao.ferramenta}:`, e);
        erro = true;
        await ctx.adminClient.from("ia_acoes").update({
          status: "erro",
          confirmada_em: new Date().toISOString(),
          duracao_ms: Date.now() - t0,
          erro: conteudo,
        }).eq("id", acao.id);
      }
    }
  }

  // Remonta a mensagem de resultados da rodada inteira (leituras já feitas + esta).
  const { data: acoes } = await ctx.adminClient
    .from("ia_acoes")
    .select("id, tool_use_id, status, resultado, erro, motivo_negada")
    .eq("mensagem_id", acao.mensagem_id)
    .order("criada_em", { ascending: true });
  const resultados = ((acoes ?? []) as Linha[])
    .filter((a) => typeof a.tool_use_id === "string")
    .map((a) => {
      if (a.id === acao.id) {
        return { type: "tool_result", tool_use_id: a.tool_use_id, content: conteudo, ...(erro ? { is_error: true } : {}) };
      }
      const ok = a.status === "executada";
      const content = ok
        ? cortar(JSON.stringify(a.resultado ?? null))
        : String(a.erro ?? a.motivo_negada ?? "Sem resultado.");
      return { type: "tool_result", tool_use_id: a.tool_use_id, content, ...(ok ? {} : { is_error: true }) };
    });

  const conversa: Conversa = { id: acao.conversa_id as string };
  const { messages, ordem } = await carregarHistorico(ctx, conversa.id);
  const proxima = ordem + 1;
  await gravarMensagem(ctx, conversa.id, proxima, "user", resultados, null);
  messages.push({ role: "user", content: resultados as unknown as Mensagem["content"] });
  return laco(ctx, conversa, messages, proxima);
}

