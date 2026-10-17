import { ShoppingCart } from "lucide-react";
import { LinhaLembrete } from "@/components/listas/LinhaLembrete";
import { useContagemCompras } from "@/hooks/useCompras";

/** Linha do topo do painel: quantos itens da lista de compras faltam comprar. */
export function LembreteCompras() {
  const { data, isError } = useContagemCompras();
  // Sem a contagem, a linha some: o painel não depende dela.
  if (isError) return null;
  return (
    <LinhaLembrete
      icone={<ShoppingCart />}
      titulo="Compras"
      rota="/compras"
      rotaNovo="/compras?novo=1"
      rotuloNovo="Adicionar"
      abertos={data}
      rotuloAbertos={(n) => `${n} a comprar`}
      textoVazio="Nada para comprar"
    />
  );
}
