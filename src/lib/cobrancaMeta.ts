import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Tom } from "@/components/painel/tons";

/**
 * Vocabulário único de status de cobrança.
 *
 * Antes havia 8 mapas locais, com 6 grafias para `debited` e o texto cru
 * "pago_no_vencimento" aparecendo para o proprietário. Quem mostra um status
 * usa `EtiquetaStatusCobranca` (`src/components/cobrancas/`), que lê daqui.
 * Quem precisa saber se está paga, em aberto ou resolvida usa as funções
 * abaixo, nunca compara com uma lista própria.
 */

export type StatusCobranca =
  | "draft"
  | "sent"
  | "pendente"
  | "pending"
  | "under_review"
  | "overdue"
  | "debit_notice_sent"
  | "contested"
  | "aguardando_reserva"
  | "debited"
  | "paid"
  | "pago_antecipado"
  | "pago_no_vencimento"
  | "pago_com_atraso"
  | "cancelled"
  | "arquivado";

export interface MetaStatusCobranca {
  rotulo: string;
  tom: Tom;
  /** Descrição curta para o proprietário, quando o rótulo não basta. */
  ajuda?: string;
}

export const STATUS_COBRANCA: Record<StatusCobranca, MetaStatusCobranca> = {
  draft: { rotulo: "Rascunho", tom: "neutral" },
  sent: { rotulo: "Enviada", tom: "info", ajuda: "Aguardando pagamento dentro dos 7 dias." },
  pendente: { rotulo: "Pendente", tom: "info", ajuda: "Aguardando pagamento." },
  pending: { rotulo: "Pendente", tom: "info", ajuda: "Aguardando pagamento." },
  under_review: { rotulo: "Comprovante em análise", tom: "secondary", ajuda: "A equipe está conferindo o comprovante." },
  overdue: { rotulo: "Vencida", tom: "destructive", ajuda: "O prazo de pagamento passou." },
  debit_notice_sent: { rotulo: "Aviso de débito enviado", tom: "warning", ajuda: "O valor será debitado da próxima reserva." },
  contested: { rotulo: "Contestada", tom: "warning", ajuda: "Em discussão com a equipe." },
  aguardando_reserva: { rotulo: "Aguardando reserva", tom: "secondary", ajuda: "Será debitada quando houver reserva." },
  debited: { rotulo: "Debitada em reserva", tom: "warning", ajuda: "Descontada do repasse de uma reserva." },
  paid: { rotulo: "Paga", tom: "success" },
  pago_antecipado: { rotulo: "Paga (antecipada)", tom: "success" },
  pago_no_vencimento: { rotulo: "Paga (no prazo)", tom: "success" },
  pago_com_atraso: { rotulo: "Paga (com atraso)", tom: "success" },
  cancelled: { rotulo: "Cancelada", tom: "neutral" },
  arquivado: { rotulo: "Arquivada", tom: "neutral" },
};

const PAGAS: ReadonlySet<string> = new Set(["paid", "pago_antecipado", "pago_no_vencimento", "pago_com_atraso"]);
const EM_ABERTO: ReadonlySet<string> = new Set([
  "sent",
  "pendente",
  "pending",
  "overdue",
  "under_review",
  "debit_notice_sent",
  "contested",
  "aguardando_reserva",
]);

/** Paga de fato ou por aporte/perdão (ver CLAUDE.md §3.2: o status não distingue). */
export const estaPaga = (status: string | null | undefined) => PAGAS.has(status ?? "");

/** Ainda espera pagamento ou decisão: nem rascunho, nem paga, nem debitada, nem cancelada. */
export const estaEmAberto = (status: string | null | undefined) => EM_ABERTO.has(status ?? "");

/** Nada mais a fazer: paga, debitada em reserva, cancelada ou arquivada. */
export const estaResolvida = (status: string | null | undefined) =>
  estaPaga(status) || status === "debited" || status === "cancelled" || status === "arquivado";

export const rotuloStatusCobranca = (status: string | null | undefined) =>
  STATUS_COBRANCA[status as StatusCobranca]?.rotulo ?? status ?? "—";

/** Status oferecidos à equipe ao mudar uma cobrança à mão. */
export const STATUS_COBRANCA_EDITAVEIS: StatusCobranca[] = [
  "draft",
  "sent",
  "pendente",
  "under_review",
  "overdue",
  "contested",
  "aguardando_reserva",
  "debited",
  "pago_antecipado",
  "pago_no_vencimento",
  "pago_com_atraso",
  "cancelled",
];

/* ------------------------------------------------------------------------ */
/* Valores                                                                   */
/* ------------------------------------------------------------------------ */

export interface ValoresCobranca {
  amount_cents?: number | null;
  management_contribution_cents?: number | null;
  credit_applied_cents?: number | null;
}

/** O que o proprietário paga: total menos aporte da gestão menos crédito aplicado. Nunca negativo. */
export function valorDevido(c: ValoresCobranca): number {
  return Math.max(0, (c.amount_cents ?? 0) - (c.management_contribution_cents ?? 0) - (c.credit_applied_cents ?? 0));
}

export const formatarBRL = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents ?? 0) / 100);

/* ------------------------------------------------------------------------ */
/* Datas                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * Formata uma coluna DATE ("2026-09-25") como dia local. `new Date(date)`
 * lê como meia-noite UTC e mostra o dia anterior no Brasil.
 */
export function formatarData(data: string | null | undefined, padrao = "dd/MM/yyyy"): string {
  if (!data) return "—";
  try {
    const somenteDia = /^\d{4}-\d{2}-\d{2}$/.test(data);
    return format(somenteDia ? parseISO(data) : new Date(data), padrao, { locale: ptBR });
  } catch {
    return "—";
  }
}
