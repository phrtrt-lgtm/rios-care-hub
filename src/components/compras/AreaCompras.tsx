import { Suspense, lazy, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, CheckCheck, Inbox, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { AbaPilula, BarraFiltros } from "@/components/painel/PaginaInterna";
import { GrupoCaixa } from "@/components/painel/CaixaOperacao";
import { TituloSecao } from "@/components/painel/TituloSecao";
import { IMOVEL_GERAL } from "@/components/listas/imovel";
import { DialogoObservacao } from "@/components/listas/DialogoObservacao";
import { FormularioCompra } from "@/components/compras/FormularioCompra";
import { CartaoCompra } from "@/components/compras/CartaoCompra";
import { EstadoImovel } from "@/components/listas/EstadoImovel";
import { useJanelaImoveis } from "@/hooks/useJanelaImoveis";
import { useImoveisAjuste } from "@/hooks/useAjustes";
import { useApagarCompra, useCompras, useMudarStatusCompra, type Compra } from "@/hooks/useCompras";
import { cn } from "@/lib/utils";
import { CANAL_COMPRA, type CanalCompra } from "@/lib/compraMeta";

// A Nova cobrança só carrega quando alguém conclui uma compra do proprietário.
const NovaCobranca = lazy(() => import("@/pages/NovaCobranca"));

export type AbaCompras = "pendentes" | "resolvidos";

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

interface Props {
  userId?: string;
  ehEquipe: boolean;
  ehAdmin: boolean;
  imovelInicial?: string | null;
  /** Formulário aberto no celular desde o início (a faxineira, ou vindo de "Adicionar"). */
  formAbertoInicial?: boolean;
  /** Aba controlada por fora (cabeçalho da página). Sem ela, as pílulas ficam acima da lista. */
  aba?: AbaCompras;
  onAbaChange?: (aba: AbaCompras) => void;
}

/**
 * Formulário + lista de compras + diálogos. Usado em /compras e na aba
 * Compras de /admin/manutencoes-lista, para as duas mostrarem a mesma lista.
 * Cada grupo de imóvel mostra o estado de hoje e o próximo check-out.
 */
export function AreaCompras({
  userId,
  ehEquipe,
  ehAdmin,
  imovelInicial = null,
  formAbertoInicial = false,
  aba: abaExterna,
  onAbaChange,
}: Props) {
  const ehFaxineira = !ehEquipe;
  const [abaInterna, setAbaInterna] = useState<AbaCompras>("pendentes");
  const aba = abaExterna ?? abaInterna;
  const setAba = (a: AbaCompras) => (onAbaChange ? onAbaChange(a) : setAbaInterna(a));
  const [formAberto, setFormAberto] = useState(ehFaxineira || formAbertoInicial);
  const janelas = useJanelaImoveis(ehEquipe);

  const imoveis = useImoveisAjuste();
  const pendentes = useCompras("pendentes", undefined, ehEquipe);
  const resolvidos = useCompras("resolvidos", undefined, ehEquipe && aba === "resolvidos");
  const meus = useCompras("meus", userId, ehFaxineira);
  const consulta = ehFaxineira ? meus : aba === "pendentes" ? pendentes : resolvidos;
  const [filtroCanal, setFiltroCanal] = useState<CanalCompra | "todos">("todos");
  const todos = useMemo(() => consulta.data ?? [], [consulta.data]);
  const porCanal = useMemo(() => {
    const m: Record<CanalCompra, number> = { rua: 0, online: 0 };
    for (const c of todos) m[c.canal] = (m[c.canal] ?? 0) + 1;
    return m;
  }, [todos]);
  const itens = useMemo(
    () => (filtroCanal === "todos" ? todos : todos.filter((c) => c.canal === filtroCanal)),
    [todos, filtroCanal],
  );
  const grupos = useMemo(() => agruparPorImovel(itens), [itens]);
  const agrupar = ehEquipe && aba === "pendentes";

  const mudarStatus = useMudarStatusCompra();
  const apagar = useApagarCompra();
  const [ocupados, setOcupados] = useState<Set<string>>(new Set());
  const [resposta, setResposta] = useState<{ compra: Compra; status: "comprado" | "descartado" } | null>(null);
  const [paraApagar, setParaApagar] = useState<Compra | null>(null);
  // Compra do proprietário sendo concluída: abre a cobrança preenchida.
  const [cobrar, setCobrar] = useState<Compra | null>(null);

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

  const marcarComprado = (c: Compra) => {
    if (c.custo === "owner" && !c.charge_id && c.imovel?.owner_id) {
      setCobrar(c);
      return;
    }
    return comOcupado(c.id, async () => {
      try {
        await mudarStatus.mutateAsync({ id: c.id, status: "comprado" });
        toast.success("Marcado como comprado", {
          action: { label: "Desfazer", onClick: () => void reabrir(c, true) },
        });
      } catch (erro) {
        toast.error(textoDoErro(erro));
      }
    });
  };

  const cobrancaCriada = (c: Compra, chargeId: string) =>
    void comOcupado(c.id, async () => {
      try {
        await mudarStatus.mutateAsync({ id: c.id, status: "comprado", chargeId });
        toast.success("Comprado e cobrança lançada ao proprietário");
      } catch (erro) {
        toast.error(`A cobrança foi criada, mas a compra não foi marcada: ${textoDoErro(erro)}`);
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
      podeApagar={ehAdmin || (c.autor_id === userId && c.status === "pendente")}
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
    <>
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
              imovelInicial={imovelInicial}
              onEnviado={() => {
                if (ehEquipe) setAba("pendentes");
              }}
              onFechar={ehEquipe ? () => setFormAberto(false) : undefined}
            />
          </div>
        </aside>

        <section aria-labelledby="titulo-lista-compras" className="min-w-0 space-y-3">
          <TituloSecao id="titulo-lista-compras" titulo={titulo.texto} subtitulo={titulo.sub} />

          {ehEquipe && !abaExterna && (
            <BarraFiltros role="tablist" aria-label="Situação dos pedidos">
              <AbaPilula ativa={aba === "pendentes"} quantidade={pendentes.data?.length} tom="warning" onClick={() => setAba("pendentes")}>
                A comprar
              </AbaPilula>
              <AbaPilula ativa={aba === "resolvidos"} onClick={() => setAba("resolvidos")}>
                Comprados
              </AbaPilula>
            </BarraFiltros>
          )}

          {ehEquipe && todos.length > 0 && (
            <BarraFiltros role="tablist" aria-label="Onde comprar">
              <AbaPilula ativa={filtroCanal === "todos"} quantidade={todos.length} onClick={() => setFiltroCanal("todos")}>
                Todas
              </AbaPilula>
              {(Object.keys(CANAL_COMPRA) as CanalCompra[]).map((c) => (
                <AbaPilula key={c} ativa={filtroCanal === c} quantidade={porCanal[c]} onClick={() => setFiltroCanal(c)}>
                  {CANAL_COMPRA[c].rotulo}
                </AbaPilula>
              ))}
            </BarraFiltros>
          )}

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
                <GrupoCaixa
                  key={g.chave}
                  titulo={g.nome}
                  quantidade={g.itens.length}
                  tom="primary"
                  acao={
                    g.chave !== IMOVEL_GERAL ? (
                      <EstadoImovel janela={janelas.data?.get(g.chave)} variante="linha" className="justify-end" />
                    ) : undefined
                  }
                >
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

      <Dialog open={!!cobrar} onOpenChange={(aberto) => !aberto && setCobrar(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto p-0">
          <DialogHeader className="px-6 pb-2 pt-6">
            <DialogTitle>Cobrança da compra ao proprietário</DialogTitle>
            <DialogDescription>
              Confira o valor e anexe a nota. Ao salvar (rascunho ou envio), a compra fica marcada como comprada.
            </DialogDescription>
          </DialogHeader>
          <div className="px-2 pb-4">
            {cobrar && (
              <Suspense fallback={<Skeleton className="mx-4 h-64 rounded-xl" />}>
                <NovaCobranca
                  inicial={{
                    owner_id: cobrar.imovel?.owner_id ?? undefined,
                    property_id: cobrar.property_id ?? undefined,
                    title: `Compra: ${cobrar.item}${cobrar.quantidade > 1 ? ` (× ${cobrar.quantidade})` : ""}`,
                    description: [
                      cobrar.autor_nome ? `Pedido por ${cobrar.autor_nome}.` : "",
                      cobrar.link ? `Produto: ${cobrar.link}` : "",
                    ]
                      .filter(Boolean)
                      .join(" "),
                    category: "itens",
                  }}
                  onCriada={(chargeId) => cobrancaCriada(cobrar, chargeId)}
                  onClose={() => setCobrar(null)}
                />
              </Suspense>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
    </>
  );
}
