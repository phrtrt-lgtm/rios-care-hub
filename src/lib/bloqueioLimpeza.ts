/**
 * Modos de limpeza do bloqueio de datas para uso pessoal do proprietário
 * (CLAUDE.md §3.21, `date_block_requests.limpeza`). Vocabulário único: o
 * diálogo de bloqueio, a lista do proprietário, a fila da equipe e o cartão do
 * assistente leem daqui.
 *   pix            paga a taxa de limpeza por PIX;
 *   entrega_limpo  não paga agora: a RIOS limpa antes da entrada, ele devolve o
 *                  imóvel limpo e paga a taxa se a RIOS julgar inadequado;
 *   sem_limpeza    não paga: recebe o imóvel sem limpeza antes da entrada, e a
 *                  limpeza é feita só na saída.
 */
export type ModoLimpeza = "pix" | "entrega_limpo" | "sem_limpeza";

export const MODOS_LIMPEZA: ModoLimpeza[] = ["pix", "entrega_limpo", "sem_limpeza"];

/** Valor do banco (ou da IA) → modo; qualquer outra coisa é o fluxo pago. */
export const modoLimpezaDe = (v: unknown): ModoLimpeza => (v === "entrega_limpo" || v === "sem_limpeza" ? v : "pix");

export const MODO_LIMPEZA: Record<ModoLimpeza, { titulo: string; curto: string; selo: string | null }> = {
  pix: { titulo: "Pagar a taxa de limpeza", curto: "taxa de limpeza por PIX", selo: null },
  entrega_limpo: {
    titulo: "RIOS limpa antes, eu entrego limpo",
    curto: "RIOS limpa antes; entrega limpo, sem taxa paga",
    selo: "Entrega limpo · não pagou taxa",
  },
  sem_limpeza: { titulo: "Sem limpeza antes da entrada", curto: "sem limpeza antes da entrada", selo: "Sem limpeza · limpar na saída" },
};
