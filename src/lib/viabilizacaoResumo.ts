import { estaPaga } from "@/lib/cobrancaMeta";
import type { CobrancaAvulsa, ItemViabilizacao } from "@/hooks/useViabilizacoes";

/**
 * Contas do cartão de imóvel novo (/novos-imoveis), feitas dos itens do
 * imóvel. Dinheiro = o que o proprietário paga: valor menos aporte da gestão.
 */

/** O que o proprietário paga (valor menos aporte), nunca negativo. */
export function devido(valor: number | null | undefined, aporte: number | null | undefined): number {
  return Math.max(0, (valor ?? 0) - (aporte ?? 0));
}

export interface ResumoItens {
  aFazer: number;
  feitos: number;
  enviados: number;
  /** Itens do proprietário (ou em espera) ainda não enviados. */
  previsto: number;
  /** Cobranças já enviadas. */
  cobrado: number;
  pago: number;
  emAberto: number;
  total: number;
  /** Itens classificados como compra (dentro do total). */
  compras: number;
}

export function resumirItens(itens: ItemViabilizacao[], avulsas: CobrancaAvulsa[]): ResumoItens {
  const aFazer = itens.filter((i) => i.status !== "concluido").length;
  const feitos = itens.filter((i) => i.status === "concluido" && !i.cobranca).length;
  const enviados = itens.filter((i) => !!i.cobranca).length + avulsas.length;
  const previsto = itens
    .filter((i) => !i.cobranca && (i.cost_responsible === "owner" || i.cost_responsible === "pending"))
    .reduce((s, i) => s + devido(i.amount_cents, i.management_contribution_cents), 0);
  const cobrancas = [...itens.flatMap((i) => (i.cobranca ? [i.cobranca] : [])), ...avulsas];
  const cobrado = cobrancas.reduce((s, c) => s + devido(c.amount_cents, c.management_contribution_cents), 0);
  const pago = cobrancas.filter((c) => estaPaga(c.status)).reduce((s, c) => s + devido(c.amount_cents, c.management_contribution_cents), 0);
  const compras = itens.filter((i) => i.natureza === "compra").length;
  return { aFazer, feitos, enviados, previsto, cobrado, pago, emAberto: cobrado - pago, total: aFazer + feitos + enviados, compras };
}
