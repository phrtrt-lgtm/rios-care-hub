import type { Tom } from "@/components/painel/tons";

/**
 * Vocabulário único de status, prioridade e tipo de chamado.
 *
 * Os valores vêm do enum do banco (`types.ts`): status tem 6, prioridade tem
 * 2 e tipo tem 9. Antes cada tela tinha o próprio mapa, com rótulos e cores
 * diferentes e com valores que não existem (`baixa`, `alta`, `reclamacao`).
 * Quem precisa mostrar um status usa `EtiquetaStatusTicket` (em
 * `src/components/tickets/EtiquetasTicket.tsx`), que lê daqui.
 */

export type StatusTicket = "novo" | "em_analise" | "aguardando_info" | "em_execucao" | "concluido" | "cancelado";
export type PrioridadeTicket = "normal" | "urgente";
export type TipoTicket =
  | "duvida"
  | "manutencao"
  | "cobranca"
  | "bloqueio_data"
  | "financeiro"
  | "outros"
  | "informacao"
  | "conversar_hospedes"
  | "melhorias_compras";

export interface MetaStatus {
  rotulo: string;
  tom: Tom;
  /** Ainda em andamento (aparece nas listas de "abertos"). */
  aberto: boolean;
}

export const STATUS_TICKET: Record<StatusTicket, MetaStatus> = {
  novo: { rotulo: "Novo", tom: "info", aberto: true },
  em_analise: { rotulo: "Em análise", tom: "warning", aberto: true },
  aguardando_info: { rotulo: "Aguardando info", tom: "secondary", aberto: true },
  em_execucao: { rotulo: "Em execução", tom: "primary", aberto: true },
  concluido: { rotulo: "Concluído", tom: "success", aberto: false },
  cancelado: { rotulo: "Cancelado", tom: "neutral", aberto: false },
};

/** Ordem em que os status aparecem em filtros e quadros. */
export const ORDEM_STATUS_TICKET: StatusTicket[] = [
  "novo",
  "em_analise",
  "aguardando_info",
  "em_execucao",
  "concluido",
  "cancelado",
];

export const STATUS_TICKET_ABERTOS = ORDEM_STATUS_TICKET.filter((s) => STATUS_TICKET[s].aberto);

export const PRIORIDADE_TICKET: Record<PrioridadeTicket, { rotulo: string; tom: Tom }> = {
  normal: { rotulo: "Normal", tom: "neutral" },
  urgente: { rotulo: "Urgente", tom: "destructive" },
};

export const TIPO_TICKET: Record<TipoTicket, { rotulo: string }> = {
  duvida: { rotulo: "Dúvida" },
  manutencao: { rotulo: "Manutenção" },
  cobranca: { rotulo: "Cobrança" },
  bloqueio_data: { rotulo: "Bloqueio de data" },
  financeiro: { rotulo: "Financeiro" },
  informacao: { rotulo: "Informação" },
  conversar_hospedes: { rotulo: "Conversar com hóspedes" },
  melhorias_compras: { rotulo: "Melhorias e compras" },
  outros: { rotulo: "Outros" },
};

export const ORDEM_TIPO_TICKET = Object.keys(TIPO_TICKET) as TipoTicket[];

/** Rótulo seguro para qualquer valor, inclusive os que não estão no enum. */
export const rotuloStatusTicket = (status: string | null | undefined) =>
  STATUS_TICKET[status as StatusTicket]?.rotulo ?? status ?? "—";

export const rotuloTipoTicket = (tipo: string | null | undefined) =>
  TIPO_TICKET[tipo as TipoTicket]?.rotulo ?? tipo ?? "—";

export const rotuloPrioridadeTicket = (prioridade: string | null | undefined) =>
  PRIORIDADE_TICKET[prioridade as PrioridadeTicket]?.rotulo ?? prioridade ?? "—";

export const ticketAberto = (status: string | null | undefined) => STATUS_TICKET[status as StatusTicket]?.aberto ?? true;
