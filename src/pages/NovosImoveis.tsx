import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Building2, HousePlus, Inbox, Link2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AbaPilula, BarraFiltros, CabecalhoPagina, PaginaInterna } from "@/components/painel/PaginaInterna";
import { TituloSecao } from "@/components/painel/TituloSecao";
import { SeloContagem } from "@/components/painel/CaixaOperacao";
import { SeletorImovel } from "@/components/listas/SeletorImovel";
import { MediaGallery } from "@/components/MediaGallery";
import { MaintenanceChatDialog } from "@/components/MaintenanceChatDialog";
import { EditMaintenanceDialog } from "@/components/EditMaintenanceDialog";
import { DetailSheet } from "@/components/detail-sheet/DetailSheet";
import { useDetailSheet } from "@/hooks/useDetailSheet";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useAnexarDepois, useGaleriaAnexos } from "@/hooks/useAnexosLista";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { formatBRL } from "@/lib/format";
import { ETAPAS, ETAPAS_ABERTAS, ehEtapaFinal, type EtapaViabilizacao } from "@/lib/viabilizacaoMeta";
import {
  nomeViabilizacao,
  useApagarViabilizacao,
  useAtualizarViabilizacao,
  useContasProprietarios,
  useImoveisDoPortal,
  useItensViabilizacao,
  useRecarregarItens,
  useSugestoesImoveis,
  useViabilizacoes,
  useVincularImovel,
  type ItemViabilizacao,
  type Viabilizacao,
} from "@/hooks/useViabilizacoes";
import { CartaoViabilizacao } from "@/components/viabilizacao/CartaoViabilizacao";
import { resumirItens } from "@/lib/viabilizacaoResumo";
import { FormularioViabilizacao } from "@/components/viabilizacao/FormularioViabilizacao";
import { SEM_CONTA, SeletorProprietario, type EscolhaProprietario } from "@/components/viabilizacao/SeletorProprietario";

type Filtro = "andamento" | EtapaViabilizacao | "concluidas";

function textoDoErro(erro: unknown): string {
  return erro instanceof Error && erro.message ? erro.message : "Não foi possível salvar. Tente de novo.";
}

/** Ordem na página: pela etapa do funil, depois pela visita mais próxima, depois o mais antigo. */
function ordenar(lista: Viabilizacao[]): Viabilizacao[] {
  const ordem = Object.keys(ETAPAS);
  return [...lista].sort(
    (a, b) =>
      ordem.indexOf(a.etapa) - ordem.indexOf(b.etapa) ||
      (a.visita_em ?? "9999").localeCompare(b.visita_em ?? "9999") ||
      a.created_at.localeCompare(b.created_at),
  );
}

/**
 * /novos-imoveis — viabilização dos imóveis que a RIOS acabou de pegar:
 * o que falta em cada um para entrar no ar, com o proprietário, a visita e
 * os itens (manutenções do imóvel, as mesmas do quadro "Novos imóveis" da
 * lista de manutenções). Só equipe. Aceita `?novo=1` e `?imovel=<id>`.
 */
export default function NovosImoveis() {
  useScrollRestoration();
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

  const [filtro, setFiltro] = useState<Filtro>("andamento");
  const abertas = useViabilizacoes("abertas");
  const concluidas = useViabilizacoes("concluidas", filtro === "concluidas");
  const sugestoes = useSugestoesImoveis();
  const consulta = filtro === "concluidas" ? concluidas : abertas;

  const visiveis = useMemo(() => {
    const base = consulta.data ?? [];
    return ordenar(filtro === "andamento" || filtro === "concluidas" ? base : base.filter((v) => v.etapa === filtro));
  }, [consulta.data, filtro]);

  const porEtapa = useMemo(() => {
    const m = new Map<EtapaViabilizacao, number>();
    for (const v of abertas.data ?? []) m.set(v.etapa, (m.get(v.etapa) ?? 0) + 1);
    return m;
  }, [abertas.data]);

  const propertyIds = useMemo(() => (consulta.data ?? []).flatMap((v) => (v.property_id ? [v.property_id] : [])), [consulta.data]);
  const itens = useItensViabilizacao(propertyIds);
  const jaRegistrados = useMemo(
    () => new Set([...(abertas.data ?? []), ...(concluidas.data ?? [])].flatMap((v) => (v.property_id ? [v.property_id] : []))),
    [abertas.data, concluidas.data],
  );

  // Resumo geral do que está em andamento.
  const resumoGeral = useMemo(() => {
    let aFazer = 0;
    let previsto = 0;
    let emAberto = 0;
    for (const v of abertas.data ?? []) {
      if (!v.property_id) continue;
      const r = resumirItens(itens.data?.itens.get(v.property_id) ?? [], itens.data?.avulsas.get(v.property_id) ?? []);
      aFazer += r.aFazer;
      previsto += r.previsto;
      emAberto += r.emAberto;
    }
    return { aFazer, previsto, emAberto };
  }, [abertas.data, itens.data]);

  // Cartões abertos: os em andamento começam abertos; os concluídos, fechados.
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const estaAberto = (v: Viabilizacao) => (ehEtapaFinal(v.etapa) ? fechados.has(`!${v.id}`) : !fechados.has(v.id));
  const alternar = (v: Viabilizacao) =>
    setFechados((s) => {
      const novo = new Set(s);
      const chave = ehEtapaFinal(v.etapa) ? `!${v.id}` : v.id;
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });

  // Diálogos do registro
  const [formAberto, setFormAberto] = useState(inicial.novo);
  const [editando, setEditando] = useState<Viabilizacao | null>(null);
  const [imovelSugerido, setImovelSugerido] = useState<string | null>(inicial.imovel);
  const [paraApagar, setParaApagar] = useState<Viabilizacao | null>(null);
  const [mudancaEtapa, setMudancaEtapa] = useState<{ v: Viabilizacao; etapa: EtapaViabilizacao } | null>(null);
  const [vincular, setVincular] = useState<Viabilizacao | null>(null);
  const atualizar = useAtualizarViabilizacao();
  const apagar = useApagarViabilizacao();
  const galeria = useGaleriaAnexos();
  const anexar = useAnexarDepois("viabilizacoes", "anexos", user?.id);

  const abrirNovo = (imovelId: string | null = null) => {
    setEditando(null);
    setImovelSugerido(imovelId);
    setFormAberto(true);
  };

  const mudarEtapa = async (v: Viabilizacao, etapa: EtapaViabilizacao) => {
    if (etapa === v.etapa) return;
    if (ehEtapaFinal(etapa)) {
      setMudancaEtapa({ v, etapa });
      return;
    }
    try {
      await atualizar.mutateAsync({ id: v.id, propertyId: v.property_id, mudanca: { etapa } });
      toast.success(`${nomeViabilizacao(v)}: ${ETAPAS[etapa].rotulo}`);
    } catch (erro) {
      toast.error(textoDoErro(erro));
    }
  };

  const confirmarEtapaFinal = async () => {
    if (!mudancaEtapa) return;
    const { v, etapa } = mudancaEtapa;
    try {
      await atualizar.mutateAsync({ id: v.id, propertyId: v.property_id, mudanca: { etapa } });
      toast.success(
        etapa === "no_ar"
          ? `${nomeViabilizacao(v)} está no ar. As manutenções dele voltam aos quadros normais da lista.`
          : `${nomeViabilizacao(v)} marcado como desistência.`,
      );
      setMudancaEtapa(null);
    } catch (erro) {
      toast.error(textoDoErro(erro));
    }
  };

  const confirmarApagar = async () => {
    if (!paraApagar) return;
    try {
      await apagar.mutateAsync(paraApagar);
      toast.success("Registro apagado. O imóvel e as manutenções dele continuam no portal.");
      setParaApagar(null);
    } catch (erro) {
      toast.error(textoDoErro(erro));
    }
  };

  // Ações dos itens (conversa, anexos, detalhe, edição)
  const { open: sheetAberto, entityId, entityType, openSheet, closeSheet } = useDetailSheet();
  const [chat, setChat] = useState<ItemViabilizacao | null>(null);
  const [editarItem, setEditarItem] = useState<ItemViabilizacao | null>(null);
  const [galeriaTicket, setGaleriaTicket] = useState<{ itens: { id: string; file_url: string; file_name?: string | null; file_type?: string | null }[] } | null>(null);
  const recarregarItens = useRecarregarItens();
  const todosIds = useMemo(() => [...(itens.data?.itens.values() ?? [])].flat().map((i) => i.id), [itens.data]);
  const { unreadCounts, markAsRead } = useUnreadMessages(todosIds);

  const abrirAnexos = useCallback(async (item: ItemViabilizacao) => {
    const { data, error } = await supabase
      .from("ticket_attachments")
      .select("id, file_url, file_name, file_type")
      .eq("ticket_id", item.id)
      .order("created_at", { ascending: false });
    if (error || !data || data.length === 0) {
      toast.error("Não foi possível carregar os anexos");
      return;
    }
    setGaleriaTicket({ itens: data });
  }, []);

  const acoesItem = {
    onAbrirChat: (item: ItemViabilizacao) => setChat(item),
    onAbrirAnexos: (item: ItemViabilizacao) => void abrirAnexos(item),
    onAbrirDetalhe: (item: ItemViabilizacao) => openSheet(item.id, "maintenance"),
    onEditarItem: (item: ItemViabilizacao) => setEditarItem(item),
    unreadCounts,
  };

  const totalAndamento = abertas.data?.length ?? 0;

  return (
    <PaginaInterna
      largura="larga"
      comNavInferior
      cabecalho={
        <CabecalhoPagina
          titulo="Novos imóveis"
          subtitulo="Viabilização: o que falta para cada imóvel novo entrar no ar"
          icone={<HousePlus />}
          tom="secondary"
          voltarPara="/painel"
          acoes={
            <Button size="sm" className="h-9 gap-1.5" onClick={() => abrirNovo()}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Registrar imóvel</span>
              <span className="sm:hidden">Novo</span>
            </Button>
          }
          abaixo={
            <BarraFiltros role="tablist" aria-label="Etapa">
              <AbaPilula ativa={filtro === "andamento"} quantidade={abertas.isLoading ? undefined : totalAndamento} tom="secondary" onClick={() => setFiltro("andamento")}>
                Em andamento
              </AbaPilula>
              {ETAPAS_ABERTAS.map((e) => (
                <AbaPilula key={e} ativa={filtro === e} quantidade={abertas.isLoading ? undefined : porEtapa.get(e) ?? 0} tom={ETAPAS[e].tom} onClick={() => setFiltro(e)}>
                  {ETAPAS[e].rotulo}
                </AbaPilula>
              ))}
              <AbaPilula ativa={filtro === "concluidas"} onClick={() => setFiltro("concluidas")}>
                Concluídos
              </AbaPilula>
            </BarraFiltros>
          }
        />
      }
    >
      <TituloSecao
        titulo={filtro === "concluidas" ? "Concluídos" : filtro === "andamento" ? "Em andamento" : ETAPAS[filtro].rotulo}
        subtitulo={
          filtro === "concluidas"
            ? "No ar ou desistência, os mais recentes primeiro"
            : "Cada imóvel com o que falta fazer; marque, cobre e acompanhe daqui ou da lista de manutenções"
        }
        acao={
          filtro !== "concluidas" && totalAndamento > 0 ? (
            <div className="hidden flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-muted-foreground sm:flex">
              <span className="flex items-center gap-1.5">
                <SeloContagem tom={resumoGeral.aFazer > 0 ? "warning" : "neutral"}>{resumoGeral.aFazer}</SeloContagem> a fazer
              </span>
              <span className="tabular-nums">
                Previsto <strong className="font-semibold text-foreground">{formatBRL(resumoGeral.previsto)}</strong>
              </span>
              <span className="tabular-nums">
                Em aberto <strong className={resumoGeral.emAberto > 0 ? "font-semibold text-warning" : "font-semibold text-foreground"}>{formatBRL(resumoGeral.emAberto)}</strong>
              </span>
            </div>
          ) : undefined
        }
      />

      {/* Imóveis recentes do portal sem anúncio nem registro: um clique para registrar. */}
      {filtro !== "concluidas" && (sugestoes.data?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/30 px-3 py-2 text-xs">
          <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Imóveis recentes sem anúncio na Hostex:
          </span>
          {sugestoes.data!.map((s) => (
            <Button key={s.id} type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => abrirNovo(s.id)} title="Registrar em Novos imóveis">
              <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
              {s.name}
            </Button>
          ))}
        </div>
      )}

      {consulta.isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Carregando imóveis">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : consulta.isError ? (
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="Não foi possível carregar os imóveis"
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
          icon={filtro === "concluidas" ? <Inbox className="h-6 w-6" /> : <HousePlus className="h-6 w-6" />}
          title={filtro === "concluidas" ? "Nenhum imóvel concluído ainda" : filtro === "andamento" ? "Nenhum imóvel em viabilização" : `Nenhum imóvel em “${ETAPAS[filtro].rotulo}”`}
          description={
            filtro === "concluidas"
              ? "Quando um imóvel entrar no ar (ou desistir), ele fica guardado aqui."
              : "Registre o imóvel assim que fechar com o proprietário, mesmo antes da visita: nome, endereço e quem é o dono já bastam."
          }
          action={
            filtro !== "concluidas" ? (
              <Button onClick={() => abrirNovo()} className="gap-1.5">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Registrar imóvel
              </Button>
            ) : undefined
          }
          className="rounded-xl border border-dashed border-border/70"
        />
      ) : (
        <div className="space-y-3">
          {visiveis.map((v) => (
            <CartaoViabilizacao
              key={v.id}
              viabilizacao={v}
              itens={v.property_id ? itens.data?.itens.get(v.property_id) ?? [] : []}
              avulsas={v.property_id ? itens.data?.avulsas.get(v.property_id) ?? [] : []}
              carregandoItens={!!v.property_id && itens.isLoading}
              userId={user?.id}
              podeApagar={ehAdmin || v.autor_id === user?.id}
              aberto={estaAberto(v)}
              onToggle={() => alternar(v)}
              onEditar={(alvo) => {
                setEditando(alvo);
                setFormAberto(true);
              }}
              onVincular={setVincular}
              onApagar={setParaApagar}
              onMudarEtapa={(alvo, etapa) => void mudarEtapa(alvo, etapa)}
              onAnexar={(alvo) => anexar.escolher({ id: alvo.id, atuais: alvo.anexos })}
              anexando={anexar.enviando === v.id}
              onAbrirAnexo={(alvo, i) => galeria.abrir(alvo.anexos, alvo.anexosUrls, i)}
              {...acoesItem}
            />
          ))}
        </div>
      )}

      <FormularioViabilizacao
        open={formAberto}
        onOpenChange={(aberto) => {
          setFormAberto(aberto);
          if (!aberto) {
            setEditando(null);
            setImovelSugerido(null);
          }
        }}
        editar={editando}
        imovelInicial={imovelSugerido}
        imoveisJaRegistrados={jaRegistrados}
        onSalvo={() => setFiltro("andamento")}
      />

      <DialogoVincular viabilizacao={vincular} onOpenChange={(aberto) => !aberto && setVincular(null)} imoveisJaRegistrados={jaRegistrados} />

      <ConfirmationDialog
        open={!!mudancaEtapa}
        onOpenChange={(aberto) => !aberto && setMudancaEtapa(null)}
        title={mudancaEtapa?.etapa === "no_ar" ? "Marcar como no ar?" : "Marcar como desistência?"}
        description={
          mudancaEtapa?.etapa === "no_ar"
            ? "A viabilização é concluída: o imóvel sai de Em andamento e as manutenções dele voltam aos quadros normais da lista. Cobranças em aberto continuam valendo."
            : "A viabilização é concluída como desistência. O imóvel, as manutenções e as cobranças continuam no portal."
        }
        confirmLabel={mudancaEtapa?.etapa === "no_ar" ? "Está no ar" : "Confirmar desistência"}
        variant={mudancaEtapa?.etapa === "desistiu" ? "destructive" : "default"}
        loading={atualizar.isPending}
        onConfirm={confirmarEtapaFinal}
      />

      <ConfirmationDialog
        open={!!paraApagar}
        onOpenChange={(aberto) => !aberto && setParaApagar(null)}
        title="Apagar este registro?"
        description="Só o registro de viabilização some (com as fotos da visita). O imóvel, as manutenções e as cobranças continuam no portal. Para encerrar, prefira marcar como “No ar”."
        confirmLabel="Apagar"
        variant="destructive"
        loading={apagar.isPending}
        onConfirm={confirmarApagar}
      />

      {galeria.elemento}
      {anexar.elemento}

      {galeriaTicket && (
        <MediaGallery items={galeriaTicket.itens} initialIndex={0} open onOpenChange={(v) => !v && setGaleriaTicket(null)} />
      )}

      <MaintenanceChatDialog
        open={!!chat}
        onOpenChange={(aberto) => {
          if (!aberto && chat) markAsRead(chat.id);
          if (!aberto) setChat(null);
        }}
        ticketId={chat?.id ?? null}
        ticketSubject={chat?.subject}
        propertyName={chat?.property?.name}
        onTicketUpdated={recarregarItens}
      />

      <EditMaintenanceDialog
        open={!!editarItem}
        onOpenChange={(aberto) => !aberto && setEditarItem(null)}
        editId={editarItem?.id ?? null}
        type="maintenance"
        onSaved={recarregarItens}
      />

      <DetailSheet open={sheetAberto} onClose={closeSheet} entityId={entityId} entityType={entityType} />
    </PaginaInterna>
  );
}

/** Liga um registro sem imóvel a uma conta de proprietário (cria o imóvel) ou a um imóvel do portal. */
function DialogoVincular({
  viabilizacao: v,
  onOpenChange,
  imoveisJaRegistrados,
}: {
  viabilizacao: Viabilizacao | null;
  onOpenChange: (aberto: boolean) => void;
  imoveisJaRegistrados: Set<string>;
}) {
  const aberto = !!v;
  const contas = useContasProprietarios(aberto);
  const imoveis = useImoveisDoPortal(aberto);
  const vincular = useVincularImovel();
  const [conta, setConta] = useState<EscolhaProprietario>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  useEffect(() => {
    if (aberto) {
      setConta(null);
      setPropertyId(null);
    }
  }, [aberto]);
  const opcoes = useMemo(
    () => (imoveis.data ?? []).filter((i) => !imoveisJaRegistrados.has(i.id)).map((i) => ({ id: i.id, name: i.name })),
    [imoveis.data, imoveisJaRegistrados],
  );
  const contaEscolhida = conta && conta !== SEM_CONTA ? conta : null;
  const pronto = !!propertyId || !!contaEscolhida;

  const confirmar = async () => {
    if (!v || !pronto) return;
    try {
      await vincular.mutateAsync({ viabilizacao: v, propertyId, ownerId: propertyId ? null : contaEscolhida?.id });
      toast.success(propertyId ? "Imóvel vinculado. Agora dá para listar os itens." : `Imóvel criado no portal no nome de ${contaEscolhida!.name}.`);
      onOpenChange(false);
    } catch (erro) {
      toast.error(textoDoErro(erro));
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(a) => !vincular.isPending && onOpenChange(a)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular {v ? nomeViabilizacao(v) : ""}</DialogTitle>
          <DialogDescription>
            Escolha a conta do proprietário (o imóvel é criado no portal agora) ou um imóvel que já existe no portal.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <SeletorProprietario
            id="vincular-conta"
            valor={conta}
            onChange={(c) => {
              setConta(c);
              if (c && c !== SEM_CONTA) setPropertyId(null);
            }}
            contas={contas.data ?? []}
            carregando={contas.isLoading}
          />
          <p className="text-center text-xs text-muted-foreground">ou</p>
          <SeletorImovel
            id="vincular-imovel"
            valor={propertyId}
            onChange={(id) => {
              setPropertyId(id);
              setConta(null);
            }}
            imoveis={opcoes}
            carregando={imoveis.isLoading}
            ehFaxineira={false}
            semGeral
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={vincular.isPending}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void confirmar()} disabled={!pronto || vincular.isPending} className="gap-1.5">
              <Link2 className="h-4 w-4" aria-hidden="true" />
              Vincular
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
