import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCheck, Inbox, Plus, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { AbaPilula, BarraFiltros, CabecalhoPagina, PaginaInterna } from "@/components/painel/PaginaInterna";
import { TituloSecao } from "@/components/painel/TituloSecao";
import { FormularioAjuste } from "@/components/ajustes/FormularioAjuste";
import { IMOVEL_GERAL } from "@/components/listas/imovel";
import { CartaoAjuste } from "@/components/ajustes/CartaoAjuste";
import { DialogoResposta } from "@/components/ajustes/DialogoResposta";
import {
  useAjustes,
  useApagarAjuste,
  useImoveisAjuste,
  useMudarStatusAjuste,
  type Ajuste,
} from "@/hooks/useAjustes";
import {
  CATEGORIA_AJUSTE,
  ORDEM_CATEGORIA_AJUSTE,
  ehCategoriaAjuste,
  type CategoriaAjuste,
} from "@/lib/ajusteMeta";
import { cn } from "@/lib/utils";
import { useAnexarDepois, useGaleriaAnexos } from "@/hooks/useAnexosLista";

type Aba = "abertos" | "resolvidos";

function textoDoErro(erro: unknown): string {
  return erro instanceof Error && erro.message ? erro.message : "Não foi possível salvar. Tente de novo.";
}

/**
 * /ajustes — o que a equipe viu de errado em anúncio, ficha, mensagens e
 * roupa de cama, num lugar só (antes ia pelo WhatsApp e se perdia).
 *
 * - Equipe (admin, agent, maintenance): avisa, vê tudo em "A fazer" e marca
 *   como feito; "Feitos" guarda o histórico.
 * - Faxineira: avisa e acompanha os próprios avisos. Entra por /faxineira.
 *
 * Aceita `?imovel=<id|geral>`, `?tipo=<categoria>` e `?novo=1` para abrir o
 * formulário já preenchido; os parâmetros saem da URL depois de lidos.
 */
export default function Ajustes() {
  const { user, profile } = useAuth();
  const papel = profile?.role as string | undefined;
  const ehEquipe = papel === "admin" || papel === "agent" || papel === "maintenance";
  const ehAdmin = papel === "admin";
  const ehFaxineira = !ehEquipe;

  const [params, setParams] = useSearchParams();
  const [inicial] = useState(() => {
    const imovel = params.get("imovel");
    const tipo = params.get("tipo");
    return {
      imovel: imovel === IMOVEL_GERAL ? IMOVEL_GERAL : imovel || null,
      tipo: ehCategoriaAjuste(tipo) ? tipo : null,
      novo: params.has("novo") || !!imovel || !!tipo,
    };
  });
  useEffect(() => {
    if (params.toString()) setParams({}, { replace: true });
    // só na chegada
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [aba, setAba] = useState<Aba>("abertos");
  const [filtro, setFiltro] = useState<CategoriaAjuste | "todas">("todas");
  // No celular a equipe vê a lista primeiro; a faxineira, o formulário.
  const [formAberto, setFormAberto] = useState(ehFaxineira || inicial.novo);

  const imoveis = useImoveisAjuste();
  const abertos = useAjustes("abertos", undefined, ehEquipe);
  const resolvidos = useAjustes("resolvidos", undefined, ehEquipe && aba === "resolvidos");
  const meus = useAjustes("meus", user?.id, ehFaxineira);
  const consulta = ehFaxineira ? meus : aba === "abertos" ? abertos : resolvidos;
  const itens = useMemo(() => consulta.data ?? [], [consulta.data]);

  const porCategoria = useMemo(() => {
    const mapa = new Map<CategoriaAjuste, number>();
    for (const a of itens) mapa.set(a.categoria, (mapa.get(a.categoria) ?? 0) + 1);
    return mapa;
  }, [itens]);
  // Filtro de uma categoria que esvaziou (o último foi feito) volta para "todos".
  const filtroEfetivo = filtro !== "todas" && !porCategoria.get(filtro) ? "todas" : filtro;
  const visiveis = filtroEfetivo === "todas" ? itens : itens.filter((a) => a.categoria === filtroEfetivo);

  const mudarStatus = useMudarStatusAjuste();
  const apagar = useApagarAjuste();
  const [ocupados, setOcupados] = useState<Set<string>>(new Set());
  const [resposta, setResposta] = useState<{ ajuste: Ajuste; status: "feito" | "descartado" } | null>(null);
  const [paraApagar, setParaApagar] = useState<Ajuste | null>(null);
  const galeria = useGaleriaAnexos();
  const anexar = useAnexarDepois("ajustes", "fotos", user?.id);

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

  const reabrir = (a: Ajuste, desfazendo = false) =>
    comOcupado(a.id, async () => {
      try {
        await mudarStatus.mutateAsync({ id: a.id, status: "aberto" });
        toast.success(desfazendo ? "Voltou para A fazer" : "Aviso reaberto: voltou para A fazer");
      } catch (erro) {
        toast.error(textoDoErro(erro));
      }
    });

  const marcarFeito = (a: Ajuste) =>
    comOcupado(a.id, async () => {
      try {
        await mudarStatus.mutateAsync({ id: a.id, status: "feito" });
        toast.success("Marcado como feito", {
          action: { label: "Desfazer", onClick: () => void reabrir(a, true) },
        });
      } catch (erro) {
        toast.error(textoDoErro(erro));
      }
    });

  const confirmarResposta = async (texto: string) => {
    if (!resposta) return;
    const { ajuste, status } = resposta;
    await comOcupado(ajuste.id, async () => {
      try {
        await mudarStatus.mutateAsync({ id: ajuste.id, status, resposta: texto });
        toast.success(
          ajuste.status === status ? "Observação salva" : status === "feito" ? "Marcado como feito" : "Marcado como sem mudança",
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
        await apagar.mutateAsync(alvo);
        toast.success("Aviso apagado");
        setParaApagar(null);
      } catch (erro) {
        toast.error(textoDoErro(erro));
      }
    });
  };


  const titulo = ehFaxineira
    ? { texto: "Seus avisos", sub: "Aqui você vê quando for resolvido" }
    : aba === "abertos"
      ? { texto: "A fazer", sub: "Urgentes primeiro, depois o mais antigo" }
      : { texto: "Feitos", sub: "Os mais recentes primeiro" };

  return (
    <PaginaInterna
      largura="larga"
      comNavInferior={ehEquipe}
      cabecalho={
        <CabecalhoPagina
          titulo="Ajustes"
          subtitulo={ehEquipe ? "Anúncios, fichas, mensagens, roupa de cama e sistema" : "Avise o que precisa arrumar"}
          icone={<SlidersHorizontal />}
          voltarPara={ehEquipe ? "/painel" : "/faxineira"}
          abaixo={
            ehEquipe ? (
              <BarraFiltros role="tablist" aria-label="Situação dos avisos">
                <AbaPilula
                  ativa={aba === "abertos"}
                  quantidade={abertos.data?.length}
                  tom="warning"
                  onClick={() => setAba("abertos")}
                >
                  A fazer
                </AbaPilula>
                <AbaPilula ativa={aba === "resolvidos"} onClick={() => setAba("resolvidos")}>
                  Feitos
                </AbaPilula>
              </BarraFiltros>
            ) : undefined
          }
        />
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <aside aria-label="Novo aviso" className="min-w-0">
          {!formAberto && (
            <button
              type="button"
              onClick={() => setFormAberto(true)}
              className="flex w-full items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-left text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Avisar um ajuste
            </button>
          )}
          <div className={cn(!formAberto && "hidden lg:block")}>
            {user && (
              <FormularioAjuste
                autorId={user.id}
                imoveis={imoveis.data ?? []}
                carregandoImoveis={imoveis.isLoading}
                ehFaxineira={ehFaxineira}
                imovelInicial={inicial.imovel}
                categoriaInicial={inicial.tipo}
                onEnviado={() => {
                  if (ehEquipe) setAba("abertos");
                }}
                onFechar={ehEquipe ? () => setFormAberto(false) : undefined}
              />
            )}
          </div>
        </aside>

        <section aria-labelledby="titulo-lista-ajustes" className="min-w-0 space-y-3">
          <TituloSecao id="titulo-lista-ajustes" titulo={titulo.texto} subtitulo={titulo.sub} />

          {ehEquipe && porCategoria.size > 1 && (
            <BarraFiltros role="tablist" aria-label="Filtrar por tipo">
              <AbaPilula ativa={filtroEfetivo === "todas"} quantidade={itens.length} onClick={() => setFiltro("todas")}>
                Todos
              </AbaPilula>
              {ORDEM_CATEGORIA_AJUSTE.filter((c) => porCategoria.get(c)).map((c) => (
                <AbaPilula
                  key={c}
                  ativa={filtroEfetivo === c}
                  quantidade={porCategoria.get(c)}
                  onClick={() => setFiltro(c)}
                >
                  {CATEGORIA_AJUSTE[c].rotulo}
                </AbaPilula>
              ))}
            </BarraFiltros>
          )}

          {consulta.isLoading ? (
            <div className="space-y-3" aria-busy="true" aria-label="Carregando avisos">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-xl" />
              ))}
            </div>
          ) : consulta.isError ? (
            <EmptyState
              icon={<AlertTriangle className="h-6 w-6" />}
              title="Não foi possível carregar os avisos"
              description="Confira a internet e tente de novo."
              action={
                <Button variant="outline" onClick={() => consulta.refetch()}>
                  Tentar de novo
                </Button>
              }
              className="rounded-xl border border-dashed border-border/70"
            />
          ) : visiveis.length === 0 ? (
            <EmptyState
              icon={ehEquipe && aba === "abertos" ? <CheckCheck className="h-6 w-6" /> : <Inbox className="h-6 w-6" />}
              title={
                ehFaxineira
                  ? "Você ainda não avisou nada"
                  : aba === "abertos"
                    ? "Nada para ajustar"
                    : "Nenhum aviso resolvido ainda"
              }
              description={
                ehFaxineira
                  ? "Quando avisar, o aviso aparece aqui e você vê quando for resolvido."
                  : aba === "abertos"
                    ? "Quando alguém avisar um ajuste, ele aparece aqui."
                    : "O que for marcado como feito fica guardado aqui."
              }
              className="rounded-xl border border-dashed border-border/70"
            />
          ) : (
            <div className="space-y-2.5">
              {visiveis.map((a) => (
                <CartaoAjuste
                  key={a.id}
                  ajuste={a}
                  podeResolver={ehEquipe}
                  podeApagar={ehAdmin || (a.autor_id === user?.id && a.status === "aberto")}
                  mostrarAutor={ehEquipe}
                  mostrarStatusAberto={ehFaxineira}
                  ocupado={ocupados.has(a.id)}
                  onFeito={() => void marcarFeito(a)}
                  onResolverComNota={(status) => setResposta({ ajuste: a, status })}
                  onReabrir={() => void reabrir(a)}
                  onApagar={() => setParaApagar(a)}
                  onAbrirFoto={(indice) => galeria.abrir(a.fotos, a.fotosUrls, indice)}
                  onAnexar={ehEquipe ? () => anexar.escolher({ id: a.id, atuais: a.fotos }) : undefined}
                  anexando={anexar.enviando === a.id}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <DialogoResposta
        ajuste={resposta?.ajuste ?? null}
        status={resposta?.status ?? "feito"}
        open={!!resposta}
        onOpenChange={(aberto) => !aberto && setResposta(null)}
        salvando={!!resposta && ocupados.has(resposta.ajuste.id)}
        onConfirmar={(texto) => void confirmarResposta(texto)}
      />

      <ConfirmationDialog
        open={!!paraApagar}
        onOpenChange={(aberto) => !aberto && setParaApagar(null)}
        title="Apagar este aviso?"
        description="O aviso e as fotos saem da lista de vez. Para dizer que já foi resolvido, use “Feito”."
        confirmLabel="Apagar"
        variant="destructive"
        loading={!!paraApagar && ocupados.has(paraApagar.id)}
        onConfirm={confirmarApagar}
      />

      {galeria.elemento}
      {anexar.elemento}
    </PaginaInterna>
  );
}
