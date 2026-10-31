// Política do assistente: o que cada papel pode pedir, limites e a checagem
// de imóvel. É a segunda muralha (a primeira é a RLS, porque toda ferramenta
// lê e escreve com o JWT do usuário). Ver PLANO_IA_AGENTE.md §2.3 e §2.5.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import type { Ferramenta as FerramentaClaude } from "./claude.ts";

export type Papel = "admin" | "agent" | "maintenance" | "owner" | "cleaner" | "pending_owner";
export type Nivel = "leitura" | "escrita";

export const PAPEIS_EQUIPE: Papel[] = ["admin", "agent", "maintenance"];

export const LIMITES = {
  /** Linhas por consulta. */
  linhas: 50,
  /** Janela máxima de datas numa consulta, em dias. */
  janelaDias: 400,
  /** Tempo máximo de uma ferramenta. */
  timeoutMs: 8000,
  /** Rodadas modelo → ferramentas por mensagem. */
  iteracoes: 8,
  /** Minutos que uma ação espera confirmação antes de expirar. */
  confirmacaoMin: 10,
  /** Mensagens por conversa; passou disso, pede conversa nova. */
  historicoMax: 60,
  /** Tamanho máximo do resultado de ferramenta que o modelo recebe (e que fica no log). */
  resultadoChars: 16000,
};

export interface ConfigIA {
  ativo: boolean;
  modelo: string;
  effort: string;
  papeis: Record<string, boolean>;
  cotas: {
    mensagens_por_hora_equipe: number;
    mensagens_por_hora_proprietario: number;
    tokens_por_dia: number;
  };
  ferramentas_desligadas: string[];
}

export const CONFIG_PADRAO: ConfigIA = {
  ativo: false,
  modelo: "claude-sonnet-5-5",
  effort: "medium",
  papeis: { admin: true, agent: true, maintenance: true, owner: false, cleaner: false },
  cotas: { mensagens_por_hora_equipe: 60, mensagens_por_hora_proprietario: 20, tokens_por_dia: 400000 },
  ferramentas_desligadas: [],
};

/** Lê `system_config.ia_agente` com os padrões para o que faltar. */
export function lerConfig(valor: unknown): ConfigIA {
  const v = (valor ?? {}) as Partial<ConfigIA> & { papeis?: Record<string, unknown>; cotas?: Record<string, unknown> };
  return {
    ativo: v.ativo === true,
    modelo: typeof v.modelo === "string" ? v.modelo : CONFIG_PADRAO.modelo,
    effort: typeof v.effort === "string" ? v.effort : CONFIG_PADRAO.effort,
    papeis: { ...CONFIG_PADRAO.papeis, ...(v.papeis ?? {}) } as Record<string, boolean>,
    cotas: { ...CONFIG_PADRAO.cotas, ...(v.cotas ?? {}) } as ConfigIA["cotas"],
    ferramentas_desligadas: Array.isArray(v.ferramentas_desligadas)
      ? v.ferramentas_desligadas.filter((x): x is string => typeof x === "string")
      : [],
  };
}

export interface Contexto {
  uid: string;
  papel: Papel;
  nome: string;
  equipe: boolean;
  /** Cliente com o JWT do usuário: a RLS vale. */
  userClient: SupabaseClient;
  /** Service role: só log e o que a RLS nega de propósito. */
  adminClient: SupabaseClient;
  /** JWT do usuário, para chamar outras functions em nome dele (create-ticket-message, notify-ticket). */
  token: string;
  /** Dia de hoje em Brasília, YYYY-MM-DD. */
  hoje: string;
  /** Data e hora legível, para o prompt. */
  agora: string;
  pagina?: { rota?: string };
  config: ConfigIA;
}

export interface EsquemaEntrada {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties: false;
  [extra: string]: unknown;
}

export interface FerramentaIA {
  nome: string;
  /** Para o modelo: quando usar, quando não usar, o que devolve. */
  descricao: string;
  schema: EsquemaEntrada;
  nivel: Nivel;
  papeis: Papel[];
  /** Nome do campo da entrada que traz o imóvel, para a checagem de acesso e o log. */
  imovelParam?: string;
  executar(ctx: Contexto, entrada: Record<string, unknown>): Promise<unknown>;
  /** Frase para o cartão de confirmação (escrita); pode consultar o banco para pôr nomes. */
  resumo?(entrada: Record<string, unknown>, ctx: Contexto): Promise<string> | string;
}

/**
 * Chama outra edge function do projeto em nome do usuário (mesmo JWT), para
 * reaproveitar o caminho das telas: create-ticket-message, notify-ticket.
 */
export async function chamarFunction(
  ctx: Contexto,
  nome: string,
  corpo: Record<string, unknown>,
  caminhoExtra = "",
): Promise<{ ok: boolean; status: number; dados: unknown }> {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${nome}${caminhoExtra}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.token}`,
      apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(corpo),
  });
  const texto = await resp.text();
  let dados: unknown = texto;
  try {
    dados = JSON.parse(texto);
  } catch {
    /* corpo não é JSON */
  }
  return { ok: resp.ok, status: resp.status, dados };
}

export class ErroFerramenta extends Error {}

/** Ferramentas que este papel vê, em ordem fixa (o cache do prompt depende disso). */
export function ferramentasPara(papel: Papel, config: ConfigIA, catalogo: FerramentaIA[]): FerramentaIA[] {
  const desligadas = new Set(config.ferramentas_desligadas);
  return catalogo
    .filter((f) => f.papeis.includes(papel) && !desligadas.has(f.nome))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

export function paraClaude(f: FerramentaIA): FerramentaClaude {
  return { name: f.nome, description: f.descricao, input_schema: f.schema };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validarData(v: unknown, campo: string): string {
  if (typeof v !== "string" || !DATA_RE.test(v) || Number.isNaN(Date.parse(v))) {
    throw new ErroFerramenta(`O campo "${campo}" precisa de uma data no formato AAAA-MM-DD.`);
  }
  return v;
}

export const diaNum = (data: string): number => {
  const [a, m, d] = data.slice(0, 10).split("-").map(Number);
  return Date.UTC(a, m - 1, d) / 86400000;
};

export const dataDe = (dia: number): string => new Date(dia * 86400000).toISOString().slice(0, 10);

export const somarDias = (data: string, dias: number): string => dataDe(diaNum(data) + dias);

/** Confere a ordem e o tamanho da janela de datas. */
export function janela(de: unknown, ate: unknown): { de: string; ate: string; dias: number } {
  const d = validarData(de, "de");
  const a = validarData(ate, "ate");
  const dias = diaNum(a) - diaNum(d);
  if (dias < 0) throw new ErroFerramenta('A data "ate" vem antes de "de".');
  if (dias > LIMITES.janelaDias) {
    throw new ErroFerramenta(`Período grande demais: o máximo é ${LIMITES.janelaDias} dias por consulta.`);
  }
  return { de: d, ate: a, dias };
}

export function limitar(v: unknown, maximo = LIMITES.linhas): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : maximo;
  return Math.min(Math.max(n, 1), maximo);
}

export function textoCurto(v: unknown, campo: string, max = 200): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") throw new ErroFerramenta(`O campo "${campo}" precisa ser texto.`);
  return v.trim().slice(0, max);
}

export function hojeBrasilia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function agoraBrasilia(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

/**
 * Garante que o usuário alcança o imóvel. Equipe: basta existir (a RLS da
 * equipe lê todos). Proprietário: `has_property_access` (dono ou membro),
 * mesmo que a RLS já filtrasse — é a segunda muralha.
 */
export async function exigirAcessoImovel(ctx: Contexto, propertyId: unknown): Promise<{ id: string; name: string }> {
  if (!ehUuid(propertyId)) {
    throw new ErroFerramenta("Informe o id do imóvel (uuid) a partir da lista de imóveis.");
  }
  if (!ctx.equipe) {
    const { data: ok, error } = await ctx.userClient.rpc("has_property_access", {
      _user_id: ctx.uid,
      _property_id: propertyId,
    });
    if (error || ok !== true) throw new ErroFerramenta("Você não tem acesso a esse imóvel.");
  }
  const { data, error } = await ctx.userClient
    .from("properties")
    .select("id, name")
    .eq("id", propertyId)
    .maybeSingle();
  if (error) throw new ErroFerramenta(`Não consegui ler o imóvel: ${error.message}`);
  if (!data) throw new ErroFerramenta("Imóvel não encontrado ou sem acesso.");
  return data as { id: string; name: string };
}

export function comTimeout<T>(p: Promise<T>, ms = LIMITES.timeoutMs): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new ErroFerramenta("A consulta demorou demais e foi interrompida.")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export const brl = (cents: number | null | undefined): string | null =>
  cents === null || cents === undefined
    ? null
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
