import { differenceInCalendarDays, parseISO, startOfToday } from "date-fns";

/**
 * Dias até o vencimento de uma cobrança; negativo = vencida, 0 = vence hoje.
 *
 * due_date é uma data sem hora ("2026-09-25"). new Date() a leria como
 * meia-noite UTC — 21h da véspera no Brasil — e a cobrança apareceria vencida
 * no próprio dia do vencimento. parseISO lê como meia-noite local.
 */
export function diasParaVencer(dueDate: string): number {
  return differenceInCalendarDays(parseISO(dueDate), startOfToday());
}

/** Vencida = o dia do vencimento já passou. No próprio dia ainda está em dia. */
export function estaVencida(dueDate: string | null, status?: string | null): boolean {
  if (status === "overdue") return true;
  return !!dueDate && diasParaVencer(dueDate) < 0;
}
