import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCheck, Inbox, Plus, Truck } from "lucide-react";
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
import { EstadoImovel } from "@/components/listas/EstadoImovel";
import { FormularioTarefa } from "@/components/tarefas/FormularioTarefa";
import { CartaoTarefa } from "@/components/tarefas/CartaoTarefa";
import { useImoveisAjuste } from "@/hooks/useAjustes";
import { useJanelaImoveis } from "@/hooks/useJanelaImoveis";
import {
  useApagarTarefaRua,
  useMudarStatusTarefaRua,
  useTarefasRua,
  type TarefaRua,
} from "@/hooks/useTarefasRua";
import { cn } from "@/lib/utils";

type Aba = "pendentes" | "resolvidas";

function textoDoErro(erro: unknown): string {
  return erro instanceof Error && erro.message ? erro.message : "Não foi possível salvar. Tente de novo.";
}

interface Grupo {
  chave: string;
  nome: string;
  itens: TarefaRua[];
}

function agruparPorImovel(itens: TarefaRua[]): Grupo[] {
  const mapa = new Map<string, Grupo>();
  for (const t of itens) {
    const chave = t.property_id ?? IMOVEL_GERAL;
    const grupo = mapa.get(chave) ?? { chave, nome: t.imovel?.name ?? (t.property_id ? "Imóvel" : "Geral"), itens: [] };
    grupo.itens.push(t);
    mapa.set(chave, grupo);
  }
  return [...mapa.values()].sort((a, b) =>
    a.chave === IMOVEL_GERAL ? 1 : b.chave === IMOVEL_GERAL ? -1 : a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

/**
 * /tarefas-rua — o que a equipe de rua precisa ir fazer em cada imóvel.
 * Só equipe (admin, agent, maintenance). Cada imóvel mostra o estado de hoje
 * e o próximo check-out (`janela_imoveis`), para saber quando dá para ir.
 * Mesmo modelo de /ajustes e /compras. Aceita `?novo=1` e `?imovel=<id|geral>`.
 */
export default function TarefasRua() {
  const { user, profile } = useAuth();
  const ehAdmin = profile?.role === "admin";

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
  const [formAberto, setFormAberto] = useState(inicial.novo);

  const imoveis = useImoveisAjuste();
  const janelas = useJanelaImoveis();
  const pendentes = useTarefasRua("pendentes");
  const resolvidas = useTarefasRua("resolvidas", aba === "resolvidas");
  const consulta = aba === "pendentes" ? pendentes : resolvidas;
  const itens = useMemo(() => consulta.data ?? [], [consulta.data]);
  const grupos = useMemo(() => agruparPorImovel(itens), [itens]);

  const mudarStatus = useMudarStatusTarefaRua();
  const apagar = useApagarTarefaRua();
  const [ocupados, setOcupados] = useState<Set<string>>(new Set());
  const [resposta, setResposta] = useState<{ tarefa: TarefaRua; status: "feita" | "descartada" } | null>(null);
  const [paraApagar, setParaApagar] = useState<TarefaRua | null>(null);

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

  const reabrir = (t: TarefaRua, desfazendo = false) =>
    comOcupado(t.id, async () => {
      try {
        await mudarStatus.mutateAsync({ id: t.id, status: "pendente" });
        toast.success(desfazendo ? "Voltou para A fazer" : "Tarefa reaberta: voltou para A fazer");
      } catch (erro) {
        toast.error(textoDoErro(erro));
      }
    });

  const marcarFeita = (t: TarefaRua) =>
    comOcupado(t.id, async () => {
      try {
        await mudarStatus.mutateAsync({ id: t.id, status: "feita" });
        toast.success("Marcada como feita", { action: { label: "Desfazer", onClick: () => void reabrir(t, true) } });
      } catch (erro) {
        toast.error(textoDoErro(erro));
      }
    });

  const confirmarResposta = async (texto: string) => {
    if (!resposta) return;
    const { tarefa, status } = resposta;
    await comOcupado(tarefa.id, async () => {
      try {
        await mudarStatus.mutateAsync({ id: tarefa.id, status, resposta: texto });
        toast.success(tarefa.status === status ? "Observação salva" : status === "feita" ? "Marcada como feita" : "Marcada como não precisa");
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
        toast.success("Tarefa apagada");
        setParaApagar(null);
      } catch (erro) {
        toast.error(textoDoErro(erro));
      }
    });
  };

  const cartao = (t: TarefaRua) => (
    <CartaoTarefa
      key={t.id}
      tarefa={t}
      janela={t.property_id ? janelas.data?.get(t.property_id) : undefined}
      podeResolver
      podeApagar={ehAdmin || (t.autor_id === user?.id && t.status === "pendente")}
      mostrarImovel={aba !== "pendentes"}
      ocupado={ocupados.has(t.id)}
      onFeita={() => void marcarFeita(t)}
      onResolverComNota={(status) => setResposta({ tarefa: t, status })}
      onReabrir={() => void reabrir(t)}
      onApagar={() => setParaApagar(t)}
    />
  );

  const feitaAgora = resposta?.status === "feita";
  const jaResolvida = resposta?.tarefa.status === resposta?.status;

  return (
    <PaginaInterna
      largura="larga"
      comNavInferior
      cabecalho={
        <CabecalhoPagina
          titulo="Tarefas de rua"
          subtitulo="O que a equipe de rua precisa fazer em cada imóvel"
          icone={<Truck />}
          voltarPara="/painel"
          abaixo={
            <BarraFiltros role="tablist" aria-label="Situação das tarefas">
              <AbaPilula ativa={aba === "pendentes"} quantidade={pendentes.data?.length} tom="warning" onClick={() => setAba("pendentes")}>
                A fazer
              </AbaPilula>
              <AbaPilula ativa={aba === "resolvidas"} onClick={() => setAba("resolvidas")}>
                Feitas
              </AbaPilula>
            </BarraFiltros>
          }
        />
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <aside aria-label="Nova tarefa de rua" className="min-w-0">
          {!formAberto && (
            <button
              type="button"
              onClick={() => setFormAberto(true)}
              className="flex w-full items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-left text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nova tarefa de rua
            </button>
          )}
          <div className={cn(!formAberto && "hidden lg:block")}>
            <FormularioTarefa
              imoveis={imoveis.data ?? []}
              carregandoImoveis={imoveis.isLoading}
              janelas={janelas.data}
              imovelInicial={inicial.imovel}
              onEnviado={() => setAba("pendentes")}
              onFechar={() => setFormAberto(false)}
            />
          </div>
        </aside>

        <section aria-labelledby="titulo-lista-tarefas" className="min-w-0 space-y-3">
          <TituloSecao
            id="titulo-lista-tarefas"
            titulo={aba === "pendentes" ? "A fazer" : "Feitas"}
            subtitulo={
              aba === "pendentes"
                ? "Por imóvel, com o estado de hoje e o próximo check-out"
                : "As mais recentes primeiro"
            }
          />

          {consulta.isLoading ? (
            <div className="space-y-2.5" aria-busy="true" aria-label="Carregando tarefas">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : consulta.isError ? (
            <EmptyState
              icon={<AlertTriangle className="h-6 w-6" />}
              title="Não foi possível carregar as tarefas"
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
              icon={aba === "pendentes" ? <CheckCheck className="h-6 w-6" /> : <Inbox className="h-6 w-6" />}
              title={aba === "pendentes" ? "Nenhuma tarefa de rua" : "Nenhuma tarefa feita ainda"}
              description={
                aba === "pendentes"
                  ? "Quando alguém adicionar uma tarefa, ela aparece aqui."
                  : "O que for marcado como feito fica guardado aqui."
              }
              className="rounded-xl border border-dashed border-border/70"
            />
          ) : aba === "pendentes" ? (
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
        salvando={!!resposta && ocupados.has(resposta.tarefa.id)}
        titulo={jaResolvida ? "Observação" : feitaAgora ? "Marcar como feita" : "Não precisa"}
        descricao={`${feitaAgora ? "Conte o que foi feito." : "Explique por quê."} Quem pediu vê esta observação.`}
        trecho={resposta?.tarefa.descricao}
        valorInicial={resposta?.tarefa.resposta}
        placeholder={feitaAgora ? "Ex.: troquei a lâmpada; a toalha ficou no armário." : "Ex.: o hóspede já resolveu."}
        textoConfirmar={jaResolvida ? "Salvar" : feitaAgora ? "Marcar como feita" : "Confirmar"}
        variante={feitaAgora ? "success" : "default"}
        onConfirmar={(texto) => void confirmarResposta(texto)}
      />

      <ConfirmationDialog
        open={!!paraApagar}
        onOpenChange={(aberto) => !aberto && setParaApagar(null)}
        title="Apagar esta tarefa?"
        description="A tarefa sai da lista de vez. Para registrar que foi feita, use “Feita”."
        confirmLabel="Apagar"
        variant="destructive"
        loading={!!paraApagar && ocupados.has(paraApagar.id)}
        onConfirm={confirmarApagar}
      />
    </PaginaInterna>
  );
}
