import { supabase } from "@/integrations/supabase/client";

/**
 * Cobrança já lançada para a mesma manutenção e com o mesmo valor.
 *
 * Quem cria cobrança a partir de um ticket chama isto antes de inserir. Sem a
 * checagem, uma manutenção cuja cobrança já estava paga (em geral por aporte
 * de 100%) ganhava uma segunda cobrança idêntica ao ser enviada de novo ao
 * proprietário: em 2026-10-01 havia 18 pares assim, inflando o total de aporte.
 *
 * Rascunho e arquivada não contam. Valor diferente também não: uma segunda
 * cobrança de outro valor para o mesmo ticket é legítima (serviço extra).
 */
export async function buscarCobrancaJaLancada(
  ticketId: string,
  amountCents: number,
): Promise<{ id: string; status: string } | null> {
  if (!ticketId || !amountCents) return null;
  const { data, error } = await supabase
    .from("charges")
    .select("id, status")
    .eq("ticket_id", ticketId)
    .eq("amount_cents", amountCents)
    .is("archived_at", null)
    .neq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}
