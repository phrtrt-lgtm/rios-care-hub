// Bloqueio de limpeza — cálculo puro (sem rede, sem banco, sem relógio).
//
// O imóvel leva um dia inteiro para limpar. Para cada reserva `accepted` de um
// dos imóveis do escopo, o sistema fecha na Hostex a véspera do check-in e o
// próprio dia do check-out. Este arquivo só decide; quem lê a Hostex, grava o
// registro (`cleaning_blocks`) e escreve é `fluxo.ts`.
//
// Regras (pedido do gestor, 2026-11-05):
//   - nunca fechar check-out + 1 (regra antiga, abolida);
//   - nunca fechar noite vendida de outra reserva accepted do mesmo imóvel;
//   - nunca fechar data anterior a hoje;
//   - só liberar data que este sistema fechou (linha ativa do registro) e que
//     nenhuma outra reserva accepted justifica;
//   - no máximo 2 datas por reserva: passou disso, aborta.

/** Imóveis do escopo, pelo id numérico da Hostex. Mais nada entra. */
export const IMOVEIS_LIMPEZA: Readonly<Record<number, string>> = Object.freeze({
  12673095: "CLAUDIA",
  12673096: "CLAUDIO",
  12673098: "CONRADO",
  12673103: "FRANK",
  12673105: "GIOVANI1",
  12673106: "GIOVANI2",
  12673107: "GIOVANI3",
  12673108: "JORGE",
  12673110: "JOAO",
  12673111: "JULIANA",
  12673116: "LEO",
  12673122: "MARLON",
  12673126: "NALDOBUZIOS",
  12673129: "OSMAR2",
  12673132: "PEDRO",
  12673135: "RODRIGO",
  12673140: "ROSE",
  12673141: "VIVIANE",
});

export const MAX_DATAS_POR_RESERVA = 2;

export type TipoBuffer = "checkin_minus_1" | "checkout";
export type Buffer = { date: string; kind: TipoBuffer };

/** Reserva como a API da Hostex devolve, só com o que o cálculo usa. */
export type ReservaHostex = {
  reservation_code: string;
  property_id: number;
  check_in_date: string;
  check_out_date: string;
  status: string;
};

/** Linha ativa (released_at nulo) de `cleaning_blocks`. */
export type RegistroAtivo = {
  id: string;
  property_id: number;
  date: string;
  reservation_code: string;
  kind: TipoBuffer;
};

// ------------------------------------------------------------------- datas

const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` que existe no calendário. */
export function dataValida(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = DATA_ISO.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === s;
}

/** Soma dias a uma data `YYYY-MM-DD` (o dia é tratado como dia civil, sem fuso). */
export function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** O dia de hoje em Brasília, que é o "hoje" de todo o fluxo. */
export function hojeEm(agora: Date, fuso = "America/Sao_Paulo"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(agora);
}

// ------------------------------------------------------------ escopo e flag

/** Id numérico do imóvel na Hostex; qualquer outra coisa vira null. */
export function idImovel(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function imovelNoEscopo(id: number | null): id is number {
  return id !== null && Object.prototype.hasOwnProperty.call(IMOVEIS_LIMPEZA, id);
}

/**
 * Flag do fluxo, em `system_config` chave `limpeza_bloqueios`:
 *   { "ativo": false, "modo": "simulacao" | "escrita", "imoveis": "todos" | [ids] }
 * `simulacao` roda tudo e só registra no log o que faria. Valor ausente ou
 * malformado = desligado.
 */
export type ConfigLimpeza = { ativo: boolean; modo: "simulacao" | "escrita"; imoveis: "todos" | number[] };

export function lerConfig(valor: unknown): ConfigLimpeza {
  const v = (valor && typeof valor === "object" ? valor : {}) as Record<string, unknown>;
  let imoveis: "todos" | number[] = [];
  if (v.imoveis === "todos") imoveis = "todos";
  else if (Array.isArray(v.imoveis)) {
    imoveis = v.imoveis.map(idImovel).filter((id): id is number => imovelNoEscopo(id));
  }
  return { ativo: v.ativo === true, modo: v.modo === "escrita" ? "escrita" : "simulacao", imoveis };
}

/** O fluxo está ligado para este imóvel? A lista da flag nunca sai do escopo fixo. */
export function imovelLigado(cfg: ConfigLimpeza, id: number | null): boolean {
  if (!cfg.ativo || !imovelNoEscopo(id)) return false;
  return cfg.imoveis === "todos" || cfg.imoveis.includes(id);
}

// ------------------------------------------------------------------ evento

export const EVENTOS_DE_RESERVA = ["reservation_created", "reservation_updated"];

export type EventoLido = {
  evento: string;
  eventId: string | null;
  reservationCode: string;
  propertyId: number | null;
};

/** Campos do webhook da Hostex que o fluxo usa (payload v3 é plano; os aninhados são de versões antigas). */
export function lerEvento(payload: unknown): EventoLido {
  // deno-lint-ignore no-explicit-any
  const p = (payload && typeof payload === "object" ? payload : {}) as any;
  const primeiro = (...c: unknown[]) => c.find((x) => x !== undefined && x !== null && x !== "");
  const codigo = primeiro(p.reservation_code, p.data?.reservation_code, p.reservation?.reservation_code);
  const imovel = primeiro(p.property_id, p.data?.property_id, p.reservation?.property_id);
  const eventId = primeiro(p.event_id, p.id);
  return {
    evento: String(p.event ?? p.event_type ?? p.type ?? ""),
    eventId: eventId === undefined ? null : String(eventId),
    reservationCode: codigo === undefined ? "" : String(codigo),
    propertyId: idImovel(imovel),
  };
}

export type Decisao = { processar: true } | { processar: false; motivo: string };

/** Primeira porta: o evento entra no fluxo? Fora do escopo ou com a flag desligada, não. */
export function decidirEvento(ev: EventoLido, cfg: ConfigLimpeza): Decisao {
  if (!EVENTOS_DE_RESERVA.includes(ev.evento)) return { processar: false, motivo: `evento ${ev.evento || "(vazio)"} não é de reserva` };
  if (!ev.reservationCode) return { processar: false, motivo: "evento sem reservation_code" };
  if (ev.propertyId === null) return { processar: false, motivo: "evento sem property_id numérico" };
  if (!imovelNoEscopo(ev.propertyId)) return { processar: false, motivo: `imóvel ${ev.propertyId} fora do escopo` };
  if (!cfg.ativo) return { processar: false, motivo: "fluxo desligado (system_config.limpeza_bloqueios.ativo)" };
  if (!imovelLigado(cfg, ev.propertyId)) return { processar: false, motivo: `imóvel ${ev.propertyId} ainda não ligado na flag` };
  return { processar: true };
}

// ----------------------------------------------------------------- buffers

/** Os dois buffers de uma reserva: véspera do check-in e dia do check-out. Nunca check-out + 1. */
export function buffersDaReserva(r: Pick<ReservaHostex, "check_in_date" | "check_out_date">): Buffer[] {
  return [
    { date: somarDias(r.check_in_date, -1), kind: "checkin_minus_1" },
    { date: r.check_out_date, kind: "checkout" },
  ];
}

/** A data é noite vendida da reserva: está em [check_in, check_out). */
export function ehNoiteVendida(data: string, r: Pick<ReservaHostex, "check_in_date" | "check_out_date">): boolean {
  return r.check_in_date <= data && data < r.check_out_date;
}

/** Check-in e check-out são datas de verdade e a saída vem depois da entrada. */
export const datasOk = (r: Pick<ReservaHostex, "check_in_date" | "check_out_date">) =>
  dataValida(r.check_in_date) && dataValida(r.check_out_date) && r.check_in_date < r.check_out_date;

const porEntrada = (a: ReservaHostex, b: ReservaHostex) =>
  a.check_in_date.localeCompare(b.check_in_date) || a.reservation_code.localeCompare(b.reservation_code);

/** Outra reserva que tem a data como buffer (check-out dela ou véspera do check-in dela). */
export function bufferDeOutra(data: string, reservas: ReservaHostex[]): { reservation_code: string; kind: TipoBuffer } | null {
  for (const r of [...reservas].sort(porEntrada)) {
    const b = buffersDaReserva(r).find((x) => x.date === data);
    if (b) return { reservation_code: r.reservation_code, kind: b.kind };
  }
  return null;
}

const ROTULO: Record<TipoBuffer, string> = { checkin_minus_1: "véspera do check-in", checkout: "dia do check-out" };

// ------------------------------------------------------------------- plano

export type EntradaPlano = {
  /** Hoje em Brasília, `YYYY-MM-DD`. */
  hoje: string;
  propertyId: number;
  /** Reserva do evento. */
  codigo: string;
  /** Estado atual dessa reserva neste imóvel, lido da API; null = não está (mais) aqui. */
  reserva: ReservaHostex | null;
  /** Reservas accepted do imóvel segundo a API (pode incluir a própria). */
  ativas: ReservaHostex[];
  /** Linhas ativas do registro neste imóvel, de qualquer reserva. */
  registros: RegistroAtivo[];
  /** Calendário mestre agora: data -> available. Data ausente = a Hostex não informou. */
  disponibilidade: Record<string, boolean>;
  /**
   * Datas que este sistema mandou reabrir há poucos minutos. A reabertura é
   * assíncrona: se a data ainda aparece fechada, o fechamento é o nosso
   * (em trânsito), não um bloqueio de outra origem.
   */
  recemLiberadas?: string[];
};

export type Descarte = { date: string; kind: TipoBuffer; acao: "bloquear" | "liberar"; motivo: string };

export type Plano = {
  /** Preenchido = nada deve ser feito (trava de segurança ou dado inválido). */
  abortado: string | null;
  /** Fechar na Hostex e registrar. */
  bloquear: Buffer[];
  /** Reabrir na Hostex e marcar a linha como liberada. */
  liberar: { id: string; date: string; kind: TipoBuffer }[];
  /** Só no registro: a linha passa para outra reserva que justifica a data (ou muda de tipo). */
  transferir: { id: string; date: string; para: string; kind: TipoBuffer }[];
  /** Só no registro: a linha é dada como liberada sem escrever na Hostex. */
  encerrar: { id: string; date: string; kind: TipoBuffer; motivo: string }[];
  /** Datas que ficaram de fora, com o motivo. */
  descartadas: Descarte[];
};

const planoVazio = (): Plano => ({ abortado: null, bloquear: [], liberar: [], transferir: [], encerrar: [], descartadas: [] });
const abortar = (motivo: string): Plano => ({ ...planoVazio(), abortado: motivo });

/**
 * Decide o que fazer com os buffers de UMA reserva em UM imóvel, comparando o
 * estado atual (API) com o que o sistema já fez (registro). Serve para criação,
 * cancelamento e troca de datas: o tipo do evento não importa, só o estado.
 * Rodar duas vezes com o registro atualizado devolve um plano vazio.
 */
export function planejarBuffers(e: EntradaPlano): Plano {
  if (!imovelNoEscopo(e.propertyId)) return abortar(`imóvel ${e.propertyId} fora do escopo`);
  if (!dataValida(e.hoje)) return abortar("data de hoje inválida");
  if (!e.codigo) return abortar("reserva sem código");

  const aceitaAqui = (r: ReservaHostex) => r.status === "accepted" && r.property_id === e.propertyId;

  const propria = e.reserva && e.reserva.reservation_code === e.codigo && aceitaAqui(e.reserva) ? e.reserva : null;
  if (propria && !datasOk(propria)) {
    return abortar(`reserva ${e.codigo} com datas inválidas (${propria.check_in_date} a ${propria.check_out_date})`);
  }
  const outras = e.ativas.filter((r) => r.reservation_code !== e.codigo && aceitaAqui(r));
  const invalida = outras.find((r) => !datasOk(r));
  if (invalida) return abortar(`reserva ${invalida.reservation_code} do mesmo imóvel veio com datas inválidas`);

  const desejados = propria ? buffersDaReserva(propria) : [];
  const comNoites = propria ? [propria, ...outras] : outras;
  const doImovel = e.registros.filter((r) => r.property_id === e.propertyId);
  const meus = doImovel.filter((r) => r.reservation_code === e.codigo).sort((a, b) => a.date.localeCompare(b.date));
  const linhaNaData = new Map(doImovel.map((r) => [r.date, r] as const));
  const recem = new Set(e.recemLiberadas ?? []);
  const plano = planoVazio();

  // 1. O que esta reserva tem no registro e não quer mais (cancelou ou mudou de data).
  for (const linha of meus) {
    const continua = desejados.find((d) => d.date === linha.date);
    if (continua) {
      if (continua.kind !== linha.kind) plano.transferir.push({ id: linha.id, date: linha.date, para: e.codigo, kind: continua.kind });
      continue;
    }
    if (linha.date < e.hoje) {
      plano.encerrar.push({ id: linha.id, date: linha.date, kind: linha.kind, motivo: "data já passou: nada a reabrir" });
      continue;
    }
    const vendida = comNoites.find((r) => ehNoiteVendida(linha.date, r));
    if (vendida) {
      plano.encerrar.push({
        id: linha.id,
        date: linha.date,
        kind: linha.kind,
        motivo: `virou noite vendida da reserva ${vendida.reservation_code}: sem escrita na Hostex`,
      });
      continue;
    }
    const justifica = bufferDeOutra(linha.date, outras);
    if (justifica) {
      plano.transferir.push({ id: linha.id, date: linha.date, para: justifica.reservation_code, kind: justifica.kind });
      plano.descartadas.push({
        date: linha.date,
        kind: linha.kind,
        acao: "liberar",
        motivo: `continua fechada: é ${ROTULO[justifica.kind]} da reserva ${justifica.reservation_code}`,
      });
      continue;
    }
    plano.liberar.push({ id: linha.id, date: linha.date, kind: linha.kind });
  }

  // 2. O que esta reserva quer e ainda não tem.
  for (const d of desejados) {
    const descartar = (motivo: string) => plano.descartadas.push({ date: d.date, kind: d.kind, acao: "bloquear", motivo });
    const linha = linhaNaData.get(d.date);
    if (linha) {
      if (linha.reservation_code === e.codigo) continue; // já feito: nada a repetir
      const dona = outras.find((r) => r.reservation_code === linha.reservation_code);
      if (dona && buffersDaReserva(dona).some((b) => b.date === d.date)) {
        descartar(`já fechada por este sistema para a reserva ${linha.reservation_code}`);
      } else {
        // A reserva dona da linha não está mais accepted (ou mudou de data): a
        // data já está fechada por este sistema e passa a ser desta reserva.
        plano.transferir.push({ id: linha.id, date: d.date, para: e.codigo, kind: d.kind });
      }
      continue;
    }
    if (d.date < e.hoje) {
      descartar("data no passado");
      continue;
    }
    const vendida = outras.find((r) => ehNoiteVendida(d.date, r));
    if (vendida) {
      descartar(`noite vendida da reserva ${vendida.reservation_code}`);
      continue;
    }
    const disponivel = e.disponibilidade[d.date];
    if (disponivel === undefined) {
      descartar("a Hostex não informou a disponibilidade desta data: não escreve às cegas");
      continue;
    }
    if (disponivel === false && !recem.has(d.date)) {
      descartar("já indisponível na Hostex por outra origem (bloqueio manual ou de proprietário): não toca e não registra");
      continue;
    }
    plano.bloquear.push(d);
  }

  // 3. Trava: uma reserva nunca mexe em mais de 2 datas.
  if (desejados.length > MAX_DATAS_POR_RESERVA || plano.bloquear.length > MAX_DATAS_POR_RESERVA) {
    return abortar(`o cálculo deu ${Math.max(desejados.length, plano.bloquear.length)} datas a fechar para a reserva ${e.codigo}; o máximo é ${MAX_DATAS_POR_RESERVA}`);
  }
  if (plano.liberar.length > MAX_DATAS_POR_RESERVA) {
    return abortar(`o cálculo deu ${plano.liberar.length} datas a liberar para a reserva ${e.codigo}; o máximo é ${MAX_DATAS_POR_RESERVA}`);
  }
  return plano;
}
