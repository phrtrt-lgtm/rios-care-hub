import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { valorDevido, type ValoresCobranca } from "@/lib/cobrancaMeta";

/**
 * Saldo credor do proprietário (`owner_credits` abertos) usado nas cobranças.
 * Quem grava é a função SQL `aplicar_saldo_credor`: créditos mais antigos
 * primeiro, cobranças de vencimento mais antigo primeiro. Ela vale para o
 * proprietário (só o próprio saldo), para a equipe e para a calculadora de
 * débito em reserva, que sempre abate o saldo antes de calcular.
 */

// O types.ts ainda não tem a função; trocar quando o Lovable regenerar.
const clienteSemTipos = supabase as unknown as SupabaseClient;

export interface ResultadoSaldoCredor {
  owner_id: string;
  aplicado_cents: number;
  quitadas: number;
  saldo_restante_cents: number;
  cobrancas: Array<{ id: string; aplicado_cents: number; restante_cents: number; quitada: boolean }>;
}

/** Status em que a cobrança aceita abatimento (os mesmos da função SQL). */
export const STATUS_ABATIVEIS = ["sent", "pendente", "overdue", "aguardando_reserva"] as const;

export async function aplicarSaldoCredor(
  opcoes: { cobrancas?: string[]; proprietarioId?: string } = {},
): Promise<ResultadoSaldoCredor> {
  const { data, error } = await clienteSemTipos.rpc("aplicar_saldo_credor", {
    p_charge_ids: opcoes.cobrancas?.length ? opcoes.cobrancas : null,
    p_owner_id: opcoes.proprietarioId ?? null,
  });
  if (error) throw new Error(error.message);
  return data as ResultadoSaldoCredor;
}

/** Soma do saldo credor aberto de um proprietário. */
export async function buscarSaldoCredor(proprietarioId: string): Promise<number> {
  const { data, error } = await supabase
    .from("owner_credits")
    .select("remaining_amount_cents")
    .eq("owner_id", proprietarioId)
    .eq("status", "open")
    .gt("remaining_amount_cents", 0);
  if (error) throw error;
  return (data ?? []).reduce((s, c) => s + (c.remaining_amount_cents ?? 0), 0);
}

/**
 * Prévia do abatimento, na mesma ordem da função SQL: quanto cada cobrança
 * recebe e quanto sobra. As cobranças devem vir já filtradas e ordenadas.
 */
export function previaAbatimento<T extends ValoresCobranca & { id: string }>(
  cobrancas: T[],
  saldoCents: number,
): { porCobranca: Map<string, number>; totalCents: number; sobraCents: number } {
  const porCobranca = new Map<string, number>();
  let saldo = saldoCents;
  for (const c of cobrancas) {
    if (saldo <= 0) break;
    const usar = Math.min(saldo, valorDevido(c));
    if (usar <= 0) continue;
    porCobranca.set(c.id, usar);
    saldo -= usar;
  }
  return { porCobranca, totalCents: saldoCents - saldo, sobraCents: saldo };
}
