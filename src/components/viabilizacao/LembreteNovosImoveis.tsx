import { HousePlus } from "lucide-react";
import { LinhaLembrete } from "@/components/listas/LinhaLembrete";
import { useContagemViabilizacoes } from "@/hooks/useViabilizacoes";

/** Linha do topo do painel: imóveis novos em viabilização. */
export function LembreteNovosImoveis() {
  const { data, isError } = useContagemViabilizacoes();
  // Sem a contagem, a linha some: o painel não depende dela.
  if (isError) return null;
  return (
    <LinhaLembrete
      icone={<HousePlus />}
      titulo="Novos imóveis"
      rota="/novos-imoveis"
      rotaNovo="/novos-imoveis?novo=1"
      rotuloNovo="Registrar"
      abertos={data}
      rotuloAbertos={(n) => (n === 1 ? "1 em viabilização" : `${n} em viabilização`)}
      textoVazio="Nenhum imóvel em viabilização"
    />
  );
}
