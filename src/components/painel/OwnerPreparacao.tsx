import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, CheckCircle2, HousePlus, MessageSquare, Receipt, Rocket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { BotaoLinha, CaixaCarregando, CaixaOperacao, GrupoCaixa, LinhaCaixa } from "@/components/painel/CaixaOperacao";
import { Etiqueta } from "@/components/painel/Etiqueta";
import { TOM, type Tom } from "@/components/painel/tons";
import { MaintenanceChatDialog } from "@/components/MaintenanceChatDialog";
import { MaintenanceDetailsDialog } from "@/components/MaintenanceDetailsDialog";
import { diaLocal } from "@/lib/viabilizacaoMeta";
import { cn } from "@/lib/utils";

/**
 * Preparação do imóvel novo, vista pelo proprietário (CLAUDE.md §3.19).
 *
 * Aparece em /minha-caixa só enquanto a viabilização está aberta. É só para
 * ver e conversar: sem botão de decisão, a RIOS executa sem esperar e o que
 * o proprietário quiser decidir vai pela conversa do item (pedido do gestor,
 * 2026-10-28). Os dados vêm de `minhas_viabilizacoes()` (etapa, visita,
 * estreia; nada interno) e dos tickets de manutenção do imóvel que ele vê.
 */

interface PreparacaoImovel {
  id: string;
  property_id: string;
  nome: string;
  etapa: string;
  visita_em: string | null;
  estreia_prevista: string | null;
  created_at: string;
}

interface CobrancaDoItem {
  id: string;
  status: string;
  archived_at: string | null;
}

interface ItemPreparacao {
  id: string;
  subject: string;
  status: string;
  created_at: string;
  property_id: string;
  charges: CobrancaDoItem[] | null;
}

// A função e a tabela são de 2026-10-27/28; o types.ts pode ainda não conhecê-las.
const clienteSemTipos = supabase as unknown as SupabaseClient;

/** Como o proprietário lê cada etapa (vocabulário dele, não o da equipe). */
const ETAPA_DO_DONO: Record<string, { rotulo: string; tom: Tom; descricao: string }> = {
  captado: { rotulo: "Registrado", tom: "neutral", descricao: "Seu imóvel entrou na RIOS. A visita para levantar o que fazer vem a seguir." },
  visita: { rotulo: "Visita marcada", tom: "info", descricao: "Na visita a equipe levanta o que precisa ser feito antes de anunciar." },
  preparacao: { rotulo: "Em preparação", tom: "warning", descricao: "Consertos, compras e montagem em andamento. Acompanhe cada item abaixo." },
  pronto: { rotulo: "Pronto para anunciar", tom: "success", descricao: "Tudo feito. Agora é fotografar e publicar o anúncio." },
};

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
function diaCurto(valor: string | null): string | null {
  const d = diaLocal(valor);
  return d ? `${SEMANA[d.getDay()]} ${format(d, "dd/MM", { locale: ptBR })}` : null;
}

const STATUS_ITEM: Record<string, string> = {
  novo: "Na fila",
  em_analise: "Em análise",
  aguardando_info: "Aguardando informação",
  em_execucao: "Em execução",
  concluido: "Feito",
};

/** Cobrança lançada ao proprietário (não rascunho, não arquivada). */
const cobrancaEnviada = (item: ItemPreparacao): CobrancaDoItem | null =>
  (item.charges ?? []).find((c) => c.status !== "draft" && !c.archived_at) ?? null;

export function OwnerPreparacao() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [chat, setChat] = useState<ItemPreparacao | null>(null);
  const [detalhe, setDetalhe] = useState<string | null>(null);

  const preparacoes = useQuery({
    queryKey: ["owner-preparacoes", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<PreparacaoImovel[]> => {
      const { data, error } = await clienteSemTipos.rpc("minhas_viabilizacoes");
      if (error) throw error;
      return (data ?? []) as PreparacaoImovel[];
    },
  });

  const propertyIds = useMemo(() => (preparacoes.data ?? []).map((p) => p.property_id), [preparacoes.data]);

  const itens = useQuery({
    queryKey: ["owner-preparacoes", "itens", propertyIds],
    enabled: propertyIds.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<ItemPreparacao[]> => {
      const { data, error } = await supabase
        .from("tickets")
        .select("id, subject, status, created_at, property_id, charges(id, status, archived_at)")
        .in("property_id", propertyIds)
        .eq("ticket_type", "manutencao")
        .is("archived_at", null)
        .neq("status", "cancelado")
        // Custo de hóspede ou em espera não é assunto do proprietário.
        .or("cost_responsible.is.null,cost_responsible.not.in.(guest,pending)")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ItemPreparacao[];
    },
  });

  const ticketIds = useMemo(() => (itens.data ?? []).map((i) => i.id), [itens.data]);
  const { unreadCounts, markAsRead } = useUnreadMessages(ticketIds);

  if (!user) return null;
  if (preparacoes.isLoading) {
    return <CaixaCarregando icone={<HousePlus />} titulo="Preparação do seu imóvel" tom="secondary" linhas={2} />;
  }
  if (!preparacoes.data || preparacoes.data.length === 0) return null;

  const abrirChat = (item: ItemPreparacao) => {
    setChat(item);
    markAsRead(item.id);
  };

  return (
    <>
      {preparacoes.data.map((p) => {
        const etapa = ETAPA_DO_DONO[p.etapa] ?? ETAPA_DO_DONO.captado;
        const doImovel = (itens.data ?? []).filter((i) => i.property_id === p.property_id);
        const aFazer = doImovel.filter((i) => i.status !== "concluido");
        const feitos = doImovel.filter((i) => i.status === "concluido" && !cobrancaEnviada(i));
        const cobrados = doImovel.filter((i) => i.status === "concluido" && !!cobrancaEnviada(i));
        const total = doImovel.length;
        const prontos = feitos.length + cobrados.length;
        const progresso = total > 0 ? Math.round((prontos / total) * 100) : 0;
        const visita = diaCurto(p.visita_em);
        const estreia = diaCurto(p.estreia_prevista);

        return (
          <CaixaOperacao
            key={p.id}
            icone={<HousePlus />}
            titulo={`Preparação do imóvel ${p.nome}`}
            tom="secondary"
            selos={
              <Etiqueta tom={etapa.tom} ponto tamanho="md" solida title={etapa.descricao}>
                {etapa.rotulo}
              </Etiqueta>
            }
            subcabecalho={
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{etapa.descricao}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {visita ? `Visita ${visita}` : "Visita a marcar"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Rocket className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {estreia ? `Estreia prevista ${estreia}` : "Estreia sem data ainda"}
                  </span>
                  {total > 0 && (
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {prontos} de {total} {total === 1 ? "item feito" : "itens feitos"}
                    </span>
                  )}
                </div>
                {total > 0 && (
                  <div
                    className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={progresso}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Itens feitos"
                  >
                    <div className={cn("h-full rounded-full transition-[width]", TOM.success.ponto)} style={{ width: `${progresso}%` }} />
                  </div>
                )}
              </div>
            }
          >
            {itens.isLoading ? (
              <p className="px-1 text-xs text-muted-foreground" aria-busy="true">
                Carregando a lista…
              </p>
            ) : total === 0 ? (
              <p className="px-1 py-1 text-sm text-muted-foreground">
                A equipe ainda está montando a lista do que fazer. Assim que registrarem os itens, eles aparecem aqui, e você pode
                conversar sobre cada um.
              </p>
            ) : (
              <div className="max-h-[480px] space-y-4 overflow-y-auto pr-1">
                <p className="px-1 text-xs text-muted-foreground">
                  Dúvida ou pedido sobre algum item? Use a conversa dele: a equipe responde por lá.
                </p>
                {aFazer.length > 0 && (
                  <GrupoCaixa titulo="A fazer" quantidade={aFazer.length} tom="warning">
                    {aFazer.map((item) => (
                      <LinhaItem key={item.id} item={item} naoLidas={unreadCounts[item.id] ?? 0} onChat={abrirChat} onAbrir={setDetalhe} />
                    ))}
                  </GrupoCaixa>
                )}
                {feitos.length > 0 && (
                  <GrupoCaixa titulo="Feitos" quantidade={feitos.length} tom="success">
                    {feitos.map((item) => (
                      <LinhaItem key={item.id} item={item} naoLidas={unreadCounts[item.id] ?? 0} onChat={abrirChat} onAbrir={setDetalhe} />
                    ))}
                  </GrupoCaixa>
                )}
                {cobrados.length > 0 && (
                  <GrupoCaixa titulo="Feitos, com cobrança enviada" quantidade={cobrados.length} tom="primary">
                    {cobrados.map((item) => {
                      const cobranca = cobrancaEnviada(item)!;
                      return (
                        <LinhaItem
                          key={item.id}
                          item={item}
                          naoLidas={unreadCounts[item.id] ?? 0}
                          onChat={abrirChat}
                          onAbrir={setDetalhe}
                          extra={
                            <BotaoLinha
                              rotulo="Ver a cobrança"
                              texto="Cobrança"
                              tom="primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/cobranca/${cobranca.id}`);
                              }}
                            >
                              <Receipt />
                            </BotaoLinha>
                          }
                        />
                      );
                    })}
                  </GrupoCaixa>
                )}
              </div>
            )}
          </CaixaOperacao>
        );
      })}

      <MaintenanceChatDialog
        open={!!chat}
        onOpenChange={(aberto) => {
          if (!aberto) setChat(null);
        }}
        ticketId={chat?.id ?? null}
        ticketSubject={chat?.subject}
        propertyName={preparacoes.data.find((p) => p.property_id === chat?.property_id)?.nome}
      />
      <MaintenanceDetailsDialog open={!!detalhe} onOpenChange={(aberto) => !aberto && setDetalhe(null)} maintenanceId={detalhe} />
    </>
  );
}

function LinhaItem({
  item,
  naoLidas,
  onChat,
  onAbrir,
  extra,
}: {
  item: ItemPreparacao;
  naoLidas: number;
  onChat: (item: ItemPreparacao) => void;
  onAbrir: (id: string) => void;
  extra?: React.ReactNode;
}) {
  const feito = item.status === "concluido";
  return (
    <LinhaCaixa
      titulo={<span className={cn(feito && "text-muted-foreground")}>{item.subject}</span>}
      subtitulo={STATUS_ITEM[item.status] ?? item.status}
      tom={feito ? "success" : "neutral"}
      onClick={() => onAbrir(item.id)}
      acoes={
        <>
          {extra}
          <BotaoLinha
            rotulo="Conversar sobre este item"
            texto="Conversar"
            naoLidas={naoLidas}
            tom={naoLidas > 0 ? "primary" : "neutral"}
            onClick={(e) => {
              e.stopPropagation();
              onChat(item);
            }}
          >
            <MessageSquare />
          </BotaoLinha>
        </>
      }
    />
  );
}
