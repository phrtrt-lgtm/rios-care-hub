// Cliente único da API do Claude para todas as edge functions de IA.
//
// Regras (ver PLANO_IA_AGENTE.md §2.1):
// - modelo padrão claude-sonnet-5-5, thinking adaptativo, effort "medium";
// - nada de temperature (o Sonnet 5.5 recusa valor fora do padrão) nem de
//   tool_choice forçado (também recusado): saída estruturada vai por
//   output_config.format;
// - o histórico só anexa: blocos de thinking voltam como vieram;
// - stop_reason "refusal" chega como HTTP 200 e é tratado antes do conteúdo;
// - erro da API vira ErroIA com status e mensagem em pt-BR, para a function
//   devolver direto.
//
// O SDK é importado sem versão fixa de propósito: o Supabase resolve na
// publicação e o id do modelo é só uma string.
import Anthropic from "npm:@anthropic-ai/sdk";

export type Effort = "low" | "medium" | "high";

export const MODELO_PADRAO = "claude-sonnet-5-5";
export const EFFORT_PADRAO: Effort = "medium";

/** Modelos aceitos na configuração. Qualquer outro valor cai no padrão. */
export const MODELOS_CLAUDE: Record<string, { rotulo: string }> = {
  "claude-sonnet-5-5": { rotulo: "Claude Sonnet 5.5 (padrão)" },
  "claude-haiku-5-5": { rotulo: "Claude Haiku 5.5 (rápido e barato)" },
  "claude-opus-5-5": { rotulo: "Claude Opus 5.5 (mais capaz)" },
};

// Preço de lista em US$ por milhão de tokens = micro-dólares por token.
const PRECO_MICROUSD_POR_TOKEN: Record<string, { entrada: number; saida: number; cacheLeitura: number; cacheGravacao: number }> = {
  "claude-sonnet-5-5": { entrada: 2, saida: 10, cacheLeitura: 0.2, cacheGravacao: 2.5 },
  "claude-haiku-5-5": { entrada: 0.1, saida: 0.5, cacheLeitura: 0.01, cacheGravacao: 0.125 },
  "claude-opus-5-5": { entrada: 4, saida: 20, cacheLeitura: 0.4, cacheGravacao: 5 },
};

export function normalizarModelo(modelo?: string | null): string {
  return modelo && MODELOS_CLAUDE[modelo] ? modelo : MODELO_PADRAO;
}

export function normalizarEffort(effort?: string | null): Effort {
  return effort === "low" || effort === "medium" || effort === "high" ? effort : EFFORT_PADRAO;
}

export class ErroIA extends Error {
  status: number;
  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.status = status;
  }
}

let cliente: Anthropic | null = null;

function obterCliente(): Anthropic {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new ErroIA(503, "Assistente não configurado: falta o secret ANTHROPIC_API_KEY no Lovable Cloud.");
  }
  if (!cliente) cliente = new Anthropic({ apiKey, maxRetries: 1, timeout: 110_000 });
  return cliente;
}

export type Mensagem = Anthropic.Messages.MessageParam;
export type Ferramenta = Anthropic.Messages.Tool;
export type Resposta = Anthropic.Messages.Message;
export type Bloco = Anthropic.Messages.ContentBlock;

export interface Chamada {
  /** Parte fixa do system prompt, cacheada (mínimo de 512 tokens para o cache pegar). */
  systemFixo: string;
  /** Parte que muda por chamada (usuário, data, página); fica fora do cache. */
  systemVariavel?: string;
  tools?: Ferramenta[];
  messages: Mensagem[];
  modelo?: string;
  effort?: Effort;
  maxTokens?: number;
  /** Saída estruturada: JSON Schema que a resposta deve seguir (substitui tool_choice forçado). */
  formatoJson?: Record<string, unknown>;
}

export async function chamarClaude(p: Chamada): Promise<Resposta> {
  const client = obterCliente();
  const modelo = normalizarModelo(p.modelo);
  const effort = normalizarEffort(p.effort);

  const system: Anthropic.Messages.TextBlockParam[] = [
    { type: "text", text: p.systemFixo, cache_control: { type: "ephemeral" } },
  ];
  if (p.systemVariavel) system.push({ type: "text", text: p.systemVariavel });

  const params: Anthropic.Messages.MessageCreateParamsNonStreaming = {
    model: modelo,
    max_tokens: p.maxTokens ?? 4000,
    thinking: { type: "adaptive" },
    output_config: p.formatoJson
      ? { effort, format: { type: "json_schema", schema: p.formatoJson } }
      : { effort },
    system,
    messages: p.messages,
  };
  if (p.tools && p.tools.length > 0) params.tools = p.tools;

  try {
    return await client.messages.create(params);
  } catch (e) {
    throw traduzirErro(e);
  }
}

function traduzirErro(e: unknown): ErroIA {
  if (e instanceof ErroIA) return e;
  if (e instanceof Anthropic.AuthenticationError) {
    return new ErroIA(503, "A chave da Anthropic foi recusada. Confira o secret ANTHROPIC_API_KEY.");
  }
  if (e instanceof Anthropic.RateLimitError) {
    return new ErroIA(429, "A IA está ocupada neste momento. Tente de novo em alguns segundos.");
  }
  if (e instanceof Anthropic.BadRequestError) {
    console.error("[claude] pedido inválido:", e.message);
    return new ErroIA(400, `A IA recusou o pedido: ${e.message.slice(0, 200)}`);
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return new ErroIA(503, "Não consegui falar com a IA agora. Tente de novo.");
  }
  if (e instanceof Anthropic.APIError) {
    console.error("[claude] erro da API:", e.status, e.message);
    return new ErroIA(502, "A IA respondeu com erro. Tente de novo em instantes.");
  }
  console.error("[claude] erro inesperado:", e);
  return new ErroIA(500, "Erro inesperado ao falar com a IA.");
}

/** Texto visível da resposta (ignora thinking e tool_use). */
export function textoDe(blocos: ReadonlyArray<Bloco | Anthropic.Messages.ContentBlockParam>): string {
  return blocos
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export function blocosToolUse(r: Resposta): Anthropic.Messages.ToolUseBlock[] {
  return r.content.filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
}

export interface Uso {
  tokens_entrada: number;
  tokens_saida: number;
  tokens_cache_lidos: number;
  tokens_cache_gravados: number;
  custo_estimado_microusd: number;
}

export function usoDe(r: Resposta): Uso {
  const u = r.usage;
  const preco = PRECO_MICROUSD_POR_TOKEN[r.model] ?? PRECO_MICROUSD_POR_TOKEN[MODELO_PADRAO];
  const entrada = u.input_tokens ?? 0;
  const saida = u.output_tokens ?? 0;
  const cacheLidos = u.cache_read_input_tokens ?? 0;
  const cacheGravados = u.cache_creation_input_tokens ?? 0;
  return {
    tokens_entrada: entrada,
    tokens_saida: saida,
    tokens_cache_lidos: cacheLidos,
    tokens_cache_gravados: cacheGravados,
    custo_estimado_microusd: Math.round(
      entrada * preco.entrada + saida * preco.saida + cacheLidos * preco.cacheLeitura + cacheGravados * preco.cacheGravacao,
    ),
  };
}

/** Mensagem em pt-BR para uma recusa do modelo (stop_reason "refusal"). */
export function textoDeRecusa(r: Resposta): string {
  const categoria = (r as unknown as { stop_details?: { category?: string | null } }).stop_details?.category ?? null;
  const base = "Não posso ajudar com esse pedido.";
  if (!categoria) return base;
  return `${base} (motivo: ${categoria})`;
}

/** Resposta curta sem ferramentas: um system + um pedido. */
export async function gerarTexto(p: {
  system: string;
  pedido: string;
  modelo?: string;
  effort?: Effort;
  maxTokens?: number;
}): Promise<{ texto: string; resposta: Resposta; uso: Uso }> {
  const resposta = await chamarClaude({
    systemFixo: p.system,
    messages: [{ role: "user", content: p.pedido }],
    modelo: p.modelo,
    effort: p.effort,
    maxTokens: p.maxTokens,
  });
  if (resposta.stop_reason === "refusal") {
    throw new ErroIA(422, textoDeRecusa(resposta));
  }
  return { texto: textoDe(resposta.content), resposta, uso: usoDe(resposta) };
}

/** Saída estruturada: devolve o JSON já lido, validado pelo próprio modelo contra o schema. */
export async function gerarJson<T>(p: {
  system: string;
  pedido: string;
  schema: Record<string, unknown>;
  modelo?: string;
  effort?: Effort;
  maxTokens?: number;
}): Promise<{ dados: T; resposta: Resposta; uso: Uso }> {
  const resposta = await chamarClaude({
    systemFixo: p.system,
    messages: [{ role: "user", content: p.pedido }],
    modelo: p.modelo,
    effort: p.effort,
    maxTokens: p.maxTokens,
    formatoJson: p.schema,
  });
  if (resposta.stop_reason === "refusal") {
    throw new ErroIA(422, textoDeRecusa(resposta));
  }
  const texto = textoDe(resposta.content);
  try {
    return { dados: JSON.parse(texto) as T, resposta, uso: usoDe(resposta) };
  } catch {
    throw new ErroIA(502, "A IA devolveu um resultado fora do formato esperado.");
  }
}
