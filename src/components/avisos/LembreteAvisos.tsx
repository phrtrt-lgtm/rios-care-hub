import { Megaphone } from "lucide-react";
import { LinhaLembrete } from "@/components/listas/LinhaLembrete";
import { useAvisosProprietario } from "@/hooks/useAvisosProprietario";

/** Linha do topo do painel: conversas com proprietários que esperam a equipe. */
export function LembreteAvisos() {
  const { data, isError } = useAvisosProprietario("abertos");
  // Sem a consulta, a linha some: o painel não depende dela.
  if (isError) return null;
  return (
    <LinhaLembrete
      icone={<Megaphone />}
      titulo="Proprietários"
      rota="/avisos-proprietarios"
      rotaNovo="/avisos-proprietarios"
      rotuloNovo="Avisar"
      abertos={data ? data.filter((c) => c.vez === "equipe").length : undefined}
      rotuloAbertos={(n) => `${n} para responder`}
      textoVazio="Nada esperando a equipe"
    />
  );
}
