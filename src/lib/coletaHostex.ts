import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// `hostex_ultima_coleta` ainda não está no types.ts; trocar pelo cliente tipado quando o Lovable regenerar.
const clienteSemTipos = supabase as unknown as SupabaseClient;

/**
 * Coleta da Hostex está em dia?
 *
 * Arquivo pequeno de propósito: a barra inferior do celular e o cartão do
 * imóvel só precisam disto para decidir se mostram "Resultados", e não devem
 * puxar para o carregamento inicial todo o cálculo da página de resultados
 * (`resultadosImovel.ts`).
 */

/** Horas desde a última coleta que trouxe reservas. Acima disso os números ficam velhos demais para o proprietário. */
export const LIMITE_COLETA_HORAS = 72;

export function coletaEmDia(coletadoEm: string | null | undefined, agora = new Date()): boolean {
  if (!coletadoEm) return false;
  return (agora.getTime() - new Date(coletadoEm).getTime()) / 3_600_000 <= LIMITE_COLETA_HORAS;
}

/**
 * Última coleta da Hostex que de fato trouxe reservas. O log marca "ok" mesmo
 * quando a Hostex recusa o token e não devolve nada, então "ok" sozinho não
 * prova que os dados estão em dia.
 *
 * Lê pela função `hostex_ultima_coleta()`, que devolve só a data: o
 * proprietário não lê `hostex_sync_log` (só a equipe). Ler a tabela direto
 * daqui devolve zero linhas para ele e esconde os resultados.
 */
export function useColetaHostex(ativo = true) {
  return useQuery({
    queryKey: ["hostex-ultima-coleta"],
    enabled: ativo,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await clienteSemTipos.rpc("hostex_ultima_coleta");
      if (error) throw error;
      return typeof data === "string" ? data : null;
    },
  });
}
