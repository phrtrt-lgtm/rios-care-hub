// Bloqueio de datas na Hostex como RESERVA DIRETA, não como indisponibilidade
// (pedido do gestor em 2026-11-01, CLAUDE.md §3.21): a equipe de limpeza lê as
// reservas da Hostex no app de limpeza, e um bloqueio de calendário não aparece
// lá. Quatro tipos:
//   - "proprietario": uso pessoal pago por PIX → hóspede "Proprietário";
//   - "proprietario_entrega_limpo" (desde 2026-11-10): uso pessoal sem taxa
//     paga: a RIOS limpa antes da entrada, o dono disse que devolve limpo e
//     paga a taxa se a RIOS julgar o imóvel inadequado → canal "PROPRIETÁRIO -
//     PEDIU PRA LIMPAR E DISSE QUE IA ENTREGAR LIMPO(NÃO PAGOU TAXA)";
//   - "proprietario_sem_limpeza" (desde 2026-11-10): uso pessoal SEM taxa, o
//     dono aceitou receber o imóvel sem limpeza antes da entrada → canal
//     "PROPRIETÁRIO - NÃO PEDIU LIMPEZA/LIMPAR NA SAÍDA";
//     nos dois, o mesmo aviso vai no nome do hóspede, para a limpeza saber o
//     que fazer mesmo se o app não mostrar o canal;
//   - "manutencao":   bloqueio da equipe (IA)   → hóspede "MANUTENÇÃO · <tipo>",
//     com o tipo (Pintura, Elétrica…) para a faxineira planejar a limpeza pesada.
// O canal personalizado vem da conta da Hostex (Configurações → Opções
// personalizadas → Canais): "PROPRIETÁRIO", "MANUTENÇÃO" e os dois sem taxa.
// A function procura pelo nome; se não existir, o erro diz o que criar. Valor
// da reserva = 0 (a taxa de limpeza do proprietário, quando há, já entrou pelo
// Mercado Pago; o detalhe vai em `remarks`).
import { HOSTEX_BASE, conferirRespostaHostex, hostexGet, hostexPost } from "./hostexReserva.ts";

export type TipoInterno = "proprietario" | "proprietario_entrega_limpo" | "proprietario_sem_limpeza" | "manutencao";

/** Nomes dos canais personalizados a criar na Hostex para os dois usos sem taxa. */
export const CANAL_SEM_LIMPEZA = "PROPRIETÁRIO - NÃO PEDIU LIMPEZA/LIMPAR NA SAÍDA";
export const CANAL_ENTREGA_LIMPO = "PROPRIETÁRIO - PEDIU PRA LIMPAR E DISSE QUE IA ENTREGAR LIMPO(NÃO PAGOU TAXA)";

/** Canal que cada tipo espera encontrar na conta (para mensagens de erro e avisos). */
export const CANAL_ESPERADO: Record<TipoInterno, string> = {
  proprietario: "PROPRIETÁRIO",
  proprietario_entrega_limpo: CANAL_ENTREGA_LIMPO,
  proprietario_sem_limpeza: CANAL_SEM_LIMPEZA,
  manutencao: "MANUTENÇÃO",
};

export interface ReservaInternaEntrada {
  apiKey: string;
  /** hostex_properties.id_hostex do imóvel. */
  idHostex: number;
  /** Dia de entrada, AAAA-MM-DD. */
  checkIn: string;
  /** Dia de saída (exclusivo), AAAA-MM-DD: a última noite é a véspera. */
  checkOut: string;
  tipo: TipoInterno;
  /** Manutenção: o tipo do serviço ("Pintura"). Proprietário: ignorado. */
  titulo?: string | null;
  /** Texto livre para o campo de observações da Hostex. */
  remarks?: string | null;
  /**
   * Chave idempotente (`channel_id` da Hostex): só letras e dígitos, até 32.
   * Repetir a chave devolve a reserva já criada em vez de duplicar.
   */
  chave: string;
}

export interface ReservaInternaSaida {
  reservation_code: string;
  status: string;
  guest_name: string;
  custom_channel: { id: number; name: string };
  /**
   * true quando o tipo pedia um canal próprio (sem limpeza / entrega limpo),
   * ele não existe na conta e a reserva foi para o canal "PROPRIETÁRIO" comum
   * (o aviso segue no nome do hóspede).
   */
  canal_generico: boolean;
  income_method_id: number;
  request_id: string | null;
}

/** Nome que aparece na Hostex (e no app de limpeza) no lugar do hóspede. */
export function nomeReservaInterna(tipo: TipoInterno, titulo?: string | null): string {
  if (tipo === "proprietario") return "Proprietário";
  // Começa por "Proprietário" de propósito: hostex_reservations.interna casa pelo início do nome.
  if (tipo === "proprietario_sem_limpeza") return "Proprietário · NÃO PEDIU LIMPEZA / LIMPAR NA SAÍDA";
  if (tipo === "proprietario_entrega_limpo") return "Proprietário · PEDIU LIMPEZA / VAI ENTREGAR LIMPO (NÃO PAGOU TAXA)";
  const t = (titulo ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  return t ? `MANUTENÇÃO · ${t}` : "MANUTENÇÃO";
}

/** uuid → 32 hex, que é o máximo que o `channel_id` da Hostex aceita. */
export function chaveIdempotente(uuid: string): string {
  const hex = uuid.replace(/[^0-9a-zA-Z]/g, "");
  if (hex.length < 8) throw new Error("chave idempotente curta demais");
  return hex.slice(0, 32);
}

type Linha = Record<string, any>;

/** Nome sem acento e em minúsculas, para os padrões não dependerem de "NÃO" / "SAÍDA". */
const semAcento = (n: string) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

type ClasseCanal = "comum" | "entrega_limpo" | "sem_limpeza" | "outro";

/**
 * De que tipo é um canal de proprietário, pelo nome:
 *   entrega_limpo  fala em entregar limpo ou em não ter pago a taxa;
 *   sem_limpeza    fala em não ter pedido limpeza ou em limpar na saída;
 *   outro          fala de limpeza de um jeito que não reconhecemos (não usar);
 *   comum          só "PROPRIETÁRIO".
 * null = não é canal de proprietário.
 */
export function classeDoCanal(nome: string): ClasseCanal | null {
  const n = semAcento(nome);
  if (!/propriet|owner|dono/.test(n)) return null;
  if (/entreg|nao\s+pagou/.test(n)) return "entrega_limpo";
  if (/nao\s+pediu|sem\s+limpeza|na\s+saida/.test(n)) return "sem_limpeza";
  if (/limp/.test(n)) return "outro";
  return "comum";
}

const RE_MANUTENCAO = /manuten|maintenance|obra/i;
const FALLBACK = /rios|intern|bloqueio/i;

/**
 * Escolhe, entre os canais personalizados da conta, o do tipo pedido.
 *   - "proprietario": só o canal comum (uma reserva paga nunca vai para um
 *     canal que diz "não pediu limpeza" ou "não pagou taxa");
 *   - "proprietario_sem_limpeza" / "proprietario_entrega_limpo": o canal
 *     próprio de cada um; se não existir, o comum, com `generico = true`.
 *     Um nunca usa o canal do outro: a instrução à limpeza seria a errada;
 *   - "manutencao": canal de manutenção.
 * Devolve null quando não há canal que sirva.
 */
export function escolherCanalInterno(
  canais: Array<{ id?: unknown; name?: unknown }>,
  tipo: TipoInterno,
): { id: number; name: string; generico: boolean } | null {
  const validos = canais
    .map((c) => ({ id: Number(c?.id), name: String(c?.name ?? "") }))
    .filter((c) => Number.isInteger(c.id) && c.name.trim() !== "");
  const daClasse = (classe: ClasseCanal) => validos.find((c) => classeDoCanal(c.name) === classe);
  // Canal genérico da conta ("RIOS", "Bloqueio"…), desde que não seja de proprietário.
  const reserva = validos.find((c) => FALLBACK.test(c.name) && classeDoCanal(c.name) === null);
  if (tipo === "manutencao") {
    const c = validos.find((x) => RE_MANUTENCAO.test(x.name) && classeDoCanal(x.name) === null) ?? reserva;
    return c ? { ...c, generico: false } : null;
  }
  const comum = daClasse("comum") ?? reserva;
  if (tipo === "proprietario") return comum ? { ...comum, generico: false } : null;
  const proprio = daClasse(tipo === "proprietario_sem_limpeza" ? "sem_limpeza" : "entrega_limpo");
  if (proprio) return { ...proprio, generico: false };
  return comum ? { ...comum, generico: true } : null;
}

/**
 * Canal personalizado da conta para o tipo. Procura pelo nome em
 * GET /custom_channels; sem canal, o erro explica o que criar na Hostex.
 */
export async function resolverCanalInterno(apiKey: string, tipo: TipoInterno): Promise<{ id: number; name: string; generico: boolean }> {
  const resp = await hostexGet("/custom_channels", {}, apiKey);
  const canais: Linha[] = Array.isArray(resp?.data?.custom_channels) ? resp.data.custom_channels : [];
  const canal = escolherCanalInterno(canais, tipo);
  if (!canal) {
    throw new Error(
      `A conta da Hostex não tem canal personalizado "${CANAL_ESPERADO[tipo]}". Crie em Configurações → Opções personalizadas → Canais (hostex.io/app/settings/custom-options) e tente de novo.`,
    );
  }
  return canal;
}

/** Método de recebimento: "PIX" se existir, senão "Other", "Cash" ou o primeiro. */
export async function resolverMetodoRecebimento(apiKey: string): Promise<number> {
  const resp = await hostexGet("/income_methods", {}, apiKey);
  const metodos: Linha[] = Array.isArray(resp?.data?.income_methods) ? resp.data.income_methods : [];
  const acha = (re: RegExp) => metodos.find((m) => re.test(String(m?.name ?? "")));
  const m = acha(/pix/i) ?? acha(/^other$/i) ?? acha(/^cash$/i) ?? metodos[0];
  if (!m || !Number.isInteger(Number(m.id))) throw new Error("A conta da Hostex não tem método de recebimento cadastrado.");
  return Number(m.id);
}

/** POST /reservations. Devolve a reserva criada (ou a já existente, pela chave). */
export async function criarReservaInterna(e: ReservaInternaEntrada): Promise<ReservaInternaSaida> {
  if (!/^[A-Za-z0-9]{1,32}$/.test(e.chave)) throw new Error("chave idempotente inválida (só letras e dígitos, até 32)");
  if (!(e.checkOut > e.checkIn)) throw new Error("a saída precisa ser depois da entrada");
  const [canal, metodo] = await Promise.all([resolverCanalInterno(e.apiKey, e.tipo), resolverMetodoRecebimento(e.apiKey)]);
  const guestName = nomeReservaInterna(e.tipo, e.titulo);
  const resp = await hostexPost(
    "/reservations",
    {
      property_id: e.idHostex,
      custom_channel_id: canal.id,
      check_in_date: e.checkIn,
      check_out_date: e.checkOut,
      guest_name: guestName,
      currency: "BRL",
      rate_amount: 0,
      commission_amount: 0,
      received_amount: 0,
      income_method_id: metodo,
      channel_id: e.chave,
      ...(e.remarks ? { remarks: e.remarks.slice(0, 1000) } : {}),
    },
    e.apiKey,
  );
  const r = resp?.data?.reservation ?? resp?.data ?? {};
  const code = String(r?.reservation_code ?? "");
  const status = String(r?.status ?? "");
  if (!code) throw new Error("a Hostex não devolveu o código da reserva");
  if (status && status !== "accepted") {
    // Chave repetida de uma reserva já cancelada: a Hostex devolve a antiga.
    throw new Error(`a reserva ${code} na Hostex está "${status}", não aceita`);
  }
  return {
    reservation_code: code,
    status: status || "accepted",
    guest_name: guestName,
    custom_channel: { id: canal.id, name: canal.name },
    canal_generico: canal.generico,
    income_method_id: metodo,
    request_id: resp?.request_id ?? null,
  };
}

/** DELETE /reservations/{code}: cancela uma reserva direta (só as da conta, nunca Airbnb/Booking). */
export async function cancelarReservaHostex(apiKey: string, reservationCode: string): Promise<{ request_id: string | null }> {
  const code = String(reservationCode ?? "").trim();
  if (!code || !/^[A-Za-z0-9._-]{1,100}$/.test(code)) throw new Error("código de reserva inválido");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const resp = await fetch(`${HOSTEX_BASE}/reservations/${encodeURIComponent(code)}`, {
      method: "DELETE",
      headers: { "Hostex-Access-Token": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      signal: ctrl.signal,
    });
    const txt = await resp.text();
    let json: any = null;
    try { json = JSON.parse(txt); } catch { /* corpo não é JSON */ }
    if (!resp.ok) throw new Error(`hostex_${resp.status} DELETE /reservations/${code}: ${String(json?.error_msg ?? txt).slice(0, 300)}`);
    conferirRespostaHostex(json, `/reservations/${code}`);
    return { request_id: json?.request_id ?? null };
  } finally {
    clearTimeout(t);
  }
}
