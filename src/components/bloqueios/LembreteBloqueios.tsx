import { CalendarX } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LinhaLembrete } from "@/components/listas/LinhaLembrete";

/**
 * Linha do topo do painel: pedidos de bloqueio de datas que esperam a equipe
 * (pedidos de manutenção pendentes e bloqueios pagos que a Hostex não aceitou).
 */
export function LembreteBloqueios() {
  const { data, isError } = useQuery({
    queryKey: ["painel", "bloqueios-pendentes"],
    staleTime: 60_000,
    queryFn: async () => {
      const [pendentes, pagos] = await Promise.all([
        supabase.from("date_block_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("date_block_requests").select("id", { count: "exact", head: true }).eq("status", "pago_pendente_hostex"),
      ]);
      if (pendentes.error) throw pendentes.error;
      if (pagos.error) throw pagos.error;
      return { abertos: (pendentes.count ?? 0) + (pagos.count ?? 0), urgentes: pagos.count ?? 0 };
    },
  });
  if (isError) return null;
  return (
    <LinhaLembrete
      icone={<CalendarX />}
      titulo="Bloqueios de datas"
      rota="/admin/bloqueios-datas"
      rotaNovo="/admin/bloqueios-datas"
      rotuloNovo="Ver fila"
      abertos={data?.abertos}
      urgentes={data?.urgentes}
      rotuloAbertos={(n) => (data?.urgentes ? `${n} na fila · ${data.urgentes} pago(s) sem Hostex` : `${n} na fila`)}
      textoVazio="Nenhum pedido esperando"
    />
  );
}
