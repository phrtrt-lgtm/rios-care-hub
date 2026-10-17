import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCheck, Inbox, Plus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { AbaPilula, BarraFiltros, CabecalhoPagina, PaginaInterna } from "@/components/painel/PaginaInterna";
import { GrupoCaixa } from "@/components/painel/CaixaOperacao";
import { TituloSecao } from "@/components/painel/TituloSecao";
import { IMOVEL_GERAL } from "@/components/listas/imovel";
import { DialogoObservacao } from "@/components/listas/DialogoObservacao";
import { FormularioCompra } from "@/components/compras/FormularioCompra";
import { CartaoCompra } from "@/components/compras/CartaoCompra";
import { useImoveisAjuste } from "@/hooks/useAjustes";
import { useApagarCompra, useCompras, useMudarStatusCompra, type Compra } from "@/hooks/useCompras";
import { cn } from "@/lib/utils";

type Aba = "pendentes" | "resolvidos";

function textoDoErro(erro: unknown): string {
  return erro instanceof Error && erro.message ? erro.message : "Não foi possível salvar. Tente de novo.";
}

interface Grupo {
  chave: string;
  nome: string;
  itens: Compra[];
}

/** "A comprar" por imóvel, em ordem alfabética, com o geral no fim. */
function agruparPorImovel(itens: Compra[]): Grupo[] {
  const mapa = new Map<string, Grupo>();
  for (const c of itens) {
    const chave = c.property_id ?? IMOVEL_GERAL;
    const nome = c.imovel?.name ?? (c.property_id ? "Imóvel" : "Geral");
    const grupo = mapa.get(chave) ?? { chave, nome, itens: [] };
    grupo.itens.push(c);
    mapa.set(chave, grupo);
  }
  return [...mapa.values()].sort((a, b) =>
    a.chave === IMOVEL_GERAL ? 1 : b.chave === IMOVEL_GERAL ? -1 : a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

/**
 * /compras — lista de compras da equipe: o item, para qual imóvel e o link
 * do produto. Mesmo modelo de /ajustes (§3.13 do CLAUDE.md):
 *
 * - Equipe: pede, vê "A comprar" agrupado por imóvel e marca como comprado;
 *   "Comprados" guarda o histórico.
 * - Faxineira: pede e acompanha os próprios pedidos.
 *
 * Aceita `?novo=1` e `?imovel=<id|geral>`; os parâmetros saem da URL depois de lidos.
 */
export default function Compras() {
  const { user, profile } = useAuth();
  const papel = profile?.role as string | undefined;
  const ehEquipe = papel === "admin" || papel === "agent" || papel === "maintenance";
  const ehAdmin = papel === "admin";
  const ehFaxineira = !ehEquipe;

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

  const [aba, setAba] = useState<Aba>("pendentes");
  const [formAberto, setFormAberto] = useState(ehFaxineira || inicial.novo);

  const imoveis = useImoveisAjuste();
  const pendentes = useCompras("pendentes", undefined, ehEquipe);
  const resolvidos = useCompras("resolvidos", undefined, ehEquipe && aba === "resolvidos");
  const meus = useCompras("meus", user?.id, ehFaxineira);
  const consulta = ehFaxineira ? meus : aba === "pendentes" ? pendentes : resolvidos;
  const itens = useMemo(() => consulta.data ?? [], [consulta.data]);
  const grupos = useMemo(() => agruparPorImovel(itens), [itens]);
  const agrupar = ehEquipe && aba === "pendentes";

  const mudarStatus = useMudarStatusCompra();
  const apagar = useApagarCompra();
  const [ocupados, setOcupados] = useState<Set<string>>(new Set());
  const [resposta, setResposta] = useState<{ compra: Compra; status: "comprado" | "descartado" } | null>(null);
  const [paraApagar, setParaApagar] = useState<Compra | null>(null);

  const comOcupado = async (id: string, acao: () => Promise<void>) => {
    setOcupados((s) => new Set(s).add(id));
    try {
      await acao();
    } finally {
      setOcupados((s) => {
        const novo = new Set(s);
        novo.delete(id);
        return novo;
      });
    }
  };

  const reabrir = (c: Compra, desfazendo = false) =>
    comOcupado(c.id, async () => {
      try {
        await mudarStatus.mutateAsync({ id: c.id, status: "pendente" });
        toast.success(desfazendo ? "Voltou para A comprar" : "Pedido reaberto: voltou para A comprar");
      } catch (erro) {
        toast.error(textoDoErro(erro));
      }
    });

  const marcarComprado = (c: Compra) =>
    comOcupado(c.id, async () => {
      try {
        await mudarStatus.mutateAsync({ id: c.id, status: "comprado" });
        toast.success("Marcado como comprado", {
          action: { label: "Desfazer", onClick: () => void reabrir(c, true) },
        });
      } catch (erro) {
        toast.error(textoDoErro(erro));
      }
    });

  const confirmarResposta = async (texto: string) => {
    if (!resposta) return;
    const { compra, status } = resposta;
    await comOcupado(compra.id, async () => {
      try {
        await mudarStatus.mutateAsync({ id: compra.id, status, resposta: texto });
        toast.success(
          compra.status === status ? "Observação salva" : status === "comprado" ? "Marcado como comprado" : "Marcado como não vai comprar",
        );
        setResposta(null);
      } catch (erro) {
        toast.error(textoDoErro(erro));
      }
    });
  };

  const confirmarApagar = async () => {
    if (!paraApagar) return;
    const alvo = paraApagar;
    await comOcupado(alvo.id, async () => {
      try {
        await apagar.mutateAsync(alvo.id);
        toast.success("Pedido apagado");
        setParaApagar(null);
      } catch (erro) {
        toast.error(textoDoErro(erro));
      }
    });
  };

  const titulo = ehFaxineira
    ? { texto: "Seus pedidos", sub: "Aqui você vê quando for comprado" }
    : aba === "pendentes"
      ? { texto: "A comprar", sub: "Por imóvel; dentro de cada um, o pedido mais antigo primeiro" }
      : { texto: "Comprados", sub: "Os mais recentes primeiro" };

  const cartao = (c: Compra) => (
    <CartaoCompra
      key={c.id}
      compra={c}
      podeResolver={ehEquipe}
      podeApagar={ehAdmin || (c.autor_id === user?.id && c.status === "pendente")}
      mostrarImovel={!agrupar}
      mostrarAutor={ehEquipe}
      mostrarStatusPendente={ehFaxineira}
      ocupado={ocupados.has(c.id)}
      onComprado={() => void marcarComprado(c)}
      onResolverComNota={(status) => setResposta({ compra: c, status })}
      onReabrir={() => void reabrir(c)}
      onApagar={() => setParaApagar(c)}
    />
  );

  const feitoAgora = resposta?.status === "comprado";
  const jaResolvido = resposta?.compra.status === resposta?.status;

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
      <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <aside aria-label="Novo pedido de compra" className="min-w-0">
          {!formAberto && (
            <button
              type="button"
              onClick={() => setFormAberto(true)}
              className="flex w-full items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-left text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Adicionar à lista
            </button>
          )}
          <div className={cn(!formAberto && "hidden lg:block")}>
            <FormularioCompra
              imoveis={imoveis.data ?? []}
              carregandoImoveis={imoveis.isLoading}
              ehFaxineira={ehFaxineira}
              imovelInicial={inicial.imovel}
              onEnviado={() => {
                if (ehEquipe) setAba("pendentes");
              }}
              onFechar={ehEquipe ? () => setFormAberto(false) : undefined}
            />
          </div>
        </aside>

        <section aria-labelledby="titulo-lista-compras" className="min-w-0 space-y-3">
          <TituloSecao id="titulo-lista-compras" titulo={titulo.texto} subtitulo={titulo.sub} />

          {consulta.isLoading ? (
            <div className="space-y-2.5" aria-busy="true" aria-label="Carregando pedidos">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : consulta.isError ? (
            <EmptyState
              icon={<AlertTriangle className="h-6 w-6" />}
              title="Não foi possível carregar a lista"
              description="Confira a internet e tente de novo."
              action={
                <Button variant="outline" onClick={() => consulta.refetch()}>
                  Tentar de novo
                </Button>
              }
              className="rounded-xl border border-dashed border-border/70"
            />
          ) : itens.length === 0 ? (
            <EmptyState
              icon={ehEquipe && aba === "pendentes" ? <CheckCheck className="h-6 w-6" /> : <Inbox className="h-6 w-6" />}
              title={
                ehFaxineira
                  ? "Você ainda não pediu nada"
                  : aba === "pendentes"
                    ? "Nada para comprar"
                    : "Nenhuma compra registrada ainda"
              }
              description={
                ehFaxineira
                  ? "Quando pedir, o item aparece aqui e você vê quando for comprado."
                  : aba === "pendentes"
                    ? "Quando alguém pedir uma compra, ela aparece aqui."
                    : "O que for marcado como comprado fica guardado aqui."
              }
              className="rounded-xl border border-dashed border-border/70"
            />
          ) : agrupar ? (
            <div className="space-y-4">
              {grupos.map((g) => (
                <GrupoCaixa key={g.chave} titulo={g.nome} quantidade={g.itens.length} tom="primary">
                  <div className="space-y-2">{g.itens.map(cartao)}</div>
                </GrupoCaixa>
              ))}
            </div>
          ) : (
            <div className="space-y-2">{itens.map(cartao)}</div>
          )}
        </section>
      </div>

      <DialogoObservacao
        open={!!resposta}
        onOpenChange={(aberto) => !aberto && setResposta(null)}
        salvando={!!resposta && ocupados.has(resposta.compra.id)}
        titulo={jaResolvido ? "Observação" : feitoAgora ? "Marcar como comprado" : "Não vai comprar"}
        descricao={`${feitoAgora ? "Conte o que foi feito (onde, quando chega)." : "Explique por quê."} Quem pediu vê esta observação.`}
        trecho={resposta ? `${resposta.compra.item}${resposta.compra.quantidade > 1 ? ` × ${resposta.compra.quantidade}` : ""}` : undefined}
        valorInicial={resposta?.compra.resposta}
        placeholder={feitoAgora ? "Ex.: comprado na Amazon, chega quinta." : "Ex.: já tinha no estoque."}
        textoConfirmar={jaResolvido ? "Salvar" : feitoAgora ? "Marcar como comprado" : "Confirmar"}
        variante={feitoAgora ? "success" : "default"}
        onConfirmar={(texto) => void confirmarResposta(texto)}
      />

      <ConfirmationDialog
        open={!!paraApagar}
        onOpenChange={(aberto) => !aberto && setParaApagar(null)}
        title="Apagar este pedido?"
        description="O pedido sai da lista de vez. Para registrar que já foi comprado, use “Comprado”."
        confirmLabel="Apagar"
        variant="destructive"
        loading={!!paraApagar && ocupados.has(paraApagar.id)}
        onConfirm={confirmarApagar}
      />
    </PaginaInterna>
  );
}
