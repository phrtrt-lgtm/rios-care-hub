import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Tom } from "@/components/painel/tons";

/**
 * Estado de cada imóvel hoje e o próximo check-out, a partir das reservas da
 * Hostex (função `janela_imoveis()`, migration 20261017150000). Só datas,
 * nada de hóspede; só a equipe recebe linhas.
 */

interface LinhaJanela {
  property_id: string;
  /** Fim da estadia que inclui hoje; igual a hoje = sai hoje; nulo = ninguém hoje. */
  saida: string | null;
  proxima_entrada: string | null;
  proximo_checkout: string | null;
}

export type EstadoHoje = "ocupado" | "sai_hoje" | "livre";

export interface JanelaImovel {
  estado: EstadoHoje;
  /** Próximo check-out (do hóspede atual, ou da próxima reserva se está livre). */
  proximoCheckout: Date | null;
  /** Próxima entrada depois da saída atual (ou a partir de hoje, se livre). */
  proximaEntrada: Date | null;
}

/** "aaaa-mm-dd" como dia local (new Date("aaaa-mm-dd") seria meia-noite UTC). */
function diaLocal(valor: string | null): Date | null {
  if (!valor) return null;
  const [a, m, d] = valor.split("-").map(Number);
  return new Date(a, m - 1, d);
}

function hojeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useJanelaImoveis(ativo = true) {
  return useQuery({
    queryKey: ["janela-imoveis"],
    enabled: ativo,
    // As reservas chegam da Hostex de 6 em 6 horas; 10 min de cache basta.
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Map<string, JanelaImovel>> => {
      // A função é de 2026-10-17 e o types.ts ainda não a conhece.
      const { data, error } = await (supabase as unknown as SupabaseClient).rpc("janela_imoveis");
      if (error) throw error;
      const hoje = hojeLocal();
      const mapa = new Map<string, JanelaImovel>();
      for (const l of (data ?? []) as LinhaJanela[]) {
        const estado: EstadoHoje = !l.saida ? "livre" : l.saida === hoje ? "sai_hoje" : "ocupado";
        mapa.set(l.property_id, {
          estado,
          proximoCheckout: diaLocal(l.proximo_checkout),
          proximaEntrada: diaLocal(l.proxima_entrada),
        });
      }
      return mapa;
    },
  });
}

export const ESTADO_HOJE: Record<EstadoHoje, { rotulo: string; tom: Tom }> = {
  ocupado: { rotulo: "Ocupado", tom: "warning" },
  sai_hoje: { rotulo: "Sai hoje", tom: "info" },
  livre: { rotulo: "Livre", tom: "success" },
};

/** Ordem para ordenar por estado: livre primeiro (dá para ir agora), depois sai hoje, ocupado, sem dado. */
export function ordemEstado(j?: JanelaImovel): number {
  if (!j) return 3;
  return j.estado === "livre" ? 0 : j.estado === "sai_hoje" ? 1 : 2;
}

/** Ordem para ordenar por próximo check-out; sem check-out à frente vai para o fim. */
export function ordemCheckout(j?: JanelaImovel): number {
  return j?.proximoCheckout ? j.proximoCheckout.getTime() : Number.MAX_SAFE_INTEGER;
}
