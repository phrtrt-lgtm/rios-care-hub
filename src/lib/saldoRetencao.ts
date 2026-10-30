export interface CobrancaRetida {
  amount_cents: number | null;
  management_contribution_cents: number | null;
  credit_applied_cents: number | null;
  payments?: { amount_cents: number }[];
}

/** Saldo atual, sem presumir que status de paga equivale a dinheiro recebido. */
export function saldoRetencao(c: CobrancaRetida): number {
  const pagamentos = (c.payments ?? []).reduce((s, p) => s + p.amount_cents, 0);
  return Math.max(0, (c.amount_cents ?? 0) - (c.management_contribution_cents ?? 0)
    - (c.credit_applied_cents ?? 0) - pagamentos);
}