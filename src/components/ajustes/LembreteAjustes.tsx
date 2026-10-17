import { SlidersHorizontal } from "lucide-react";
import { LinhaLembrete } from "@/components/listas/LinhaLembrete";
import { useContagemAjustes } from "@/hooks/useAjustes";

/**
 * Linha do topo do painel: quantos ajustes a equipe avisou e ainda estão por
 * fazer. É o lembrete que substitui o WhatsApp.
 */
export function LembreteAjustes() {
  const { data, isError } = useContagemAjustes();
  // Sem a contagem, a linha some: o painel não depende dela.
  if (isError) return null;
  return (
    <LinhaLembrete
      icone={<SlidersHorizontal />}
      titulo="Ajustes"
      rota="/ajustes"
      rotaNovo="/ajustes?novo=1"
      rotuloNovo="Avisar"
      abertos={data?.abertos}
      urgentes={data?.urgentes}
      rotuloAbertos={(n) => `${n} a fazer`}
      textoVazio="Nada para ajustar"
    />
  );
}
