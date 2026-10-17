import { Truck } from "lucide-react";
import { LinhaLembrete } from "@/components/listas/LinhaLembrete";
import { useContagemTarefasRua } from "@/hooks/useTarefasRua";

/** Linha do topo do painel: tarefas da equipe de rua ainda por fazer. */
export function LembreteTarefas() {
  const { data, isError } = useContagemTarefasRua();
  // Sem a contagem, a linha some: o painel não depende dela.
  if (isError) return null;
  return (
    <LinhaLembrete
      icone={<Truck />}
      titulo="Tarefas de rua"
      rota="/tarefas-rua"
      rotaNovo="/tarefas-rua?novo=1"
      rotuloNovo="Adicionar"
      abertos={data}
      rotuloAbertos={(n) => `${n} a fazer`}
      textoVazio="Nada pendente"
    />
  );
}
