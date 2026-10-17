import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AbaPilula, BarraFiltros, CabecalhoPagina, PaginaInterna } from "@/components/painel/PaginaInterna";
import { AreaCompras, type AbaCompras } from "@/components/compras/AreaCompras";
import { useCompras } from "@/hooks/useCompras";

/**
 * /compras — lista de compras da equipe: o item, para qual imóvel e o link
 * do produto. Mesmo modelo de /ajustes (§3.14 do CLAUDE.md). O miolo fica em
 * `AreaCompras`, que também é a aba Compras de /admin/manutencoes-lista.
 *
 * Aceita `?novo=1` e `?imovel=<id|geral>`; os parâmetros saem da URL depois de lidos.
 */
export default function Compras() {
  const { user, profile } = useAuth();
  const papel = profile?.role as string | undefined;
  const ehEquipe = papel === "admin" || papel === "agent" || papel === "maintenance";

  const [params, setParams] = useSearchParams();
  const [inicial] = useState(() => {
    const imovel = params.get("imovel");
    return { imovel: imovel || null, novo: params.has("novo") || !!imovel };
  });
  useEffect(() => {
    if (params.toString()) setParams({}, { replace: true });
    // só na chegada
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [aba, setAba] = useState<AbaCompras>("pendentes");
  // Mesma chave da AreaCompras: o número da pílula não faz outra consulta.
  const pendentes = useCompras("pendentes", undefined, ehEquipe);

  return (
    <PaginaInterna
      largura="larga"
      comNavInferior={ehEquipe}
      cabecalho={
        <CabecalhoPagina
          titulo="Compras"
          subtitulo={ehEquipe ? "O que precisa comprar para cada imóvel" : "Peça o que precisa ser comprado"}
          icone={<ShoppingCart />}
          voltarPara={ehEquipe ? "/painel" : "/faxineira"}
          abaixo={
            ehEquipe ? (
              <BarraFiltros role="tablist" aria-label="Situação dos pedidos">
                <AbaPilula
                  ativa={aba === "pendentes"}
                  quantidade={pendentes.data?.length}
                  tom="warning"
                  onClick={() => setAba("pendentes")}
                >
                  A comprar
                </AbaPilula>
                <AbaPilula ativa={aba === "resolvidos"} onClick={() => setAba("resolvidos")}>
                  Comprados
                </AbaPilula>
              </BarraFiltros>
            ) : undefined
          }
        />
      }
    >
      <AreaCompras
        userId={user?.id}
        ehEquipe={ehEquipe}
        ehAdmin={papel === "admin"}
        imovelInicial={inicial.imovel}
        formAbertoInicial={inicial.novo}
        aba={ehEquipe ? aba : undefined}
        onAbaChange={setAba}
      />
    </PaginaInterna>
  );
}
