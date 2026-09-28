import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Building2, MessageSquare, Plus, Ticket, Wrench } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { saveScrollPosition } from "@/lib/navigation";
import { ownerScopeFilter } from "@/lib/ownerScope";
import { useAuth } from "@/hooks/useAuth";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useListFilters } from "@/hooks/useListFilters";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListFilters } from "@/components/list/ListFilters";
import { MaintenanceChatDialog } from "@/components/MaintenanceChatDialog";
import { MaintenanceDetailsDialog } from "@/components/MaintenanceDetailsDialog";
import { AbaPilula, BarraFiltros, CabecalhoPagina, PaginaInterna } from "@/components/painel/PaginaInterna";
import { BotaoLinha, LinhaCaixa, MiniaturaImovel } from "@/components/painel/CaixaOperacao";
import { EtiquetaPrioridadeTicket, EtiquetaStatusTicket } from "@/components/tickets/EtiquetasTicket";
import { ORDEM_TIPO_TICKET, TIPO_TICKET, ticketAberto } from "@/lib/ticketMeta";

interface ChamadoProprietario {
  id: string;
  subject: string;
  description: string | null;
  status: string;
  priority: string;
  ticket_type: string;
  created_at: string;
  property_id: string | null;
  created_by: string | null;
  properties: { name: string; cover_photo_url: string | null } | null;
}

type Aba = "abertos" | "fechados";

export default function MeusChamados() {
  useScrollRestoration();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [tickets, setTickets] = useState<ChamadoProprietario[]>([]);
  const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState<Aba>("abertos");
  const [tipo, setTipo] = useState<string>("all");
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [selecionado, setSelecionado] = useState<ChamadoProprietario | null>(null);
  const [visibleCount, setVisibleCount] = useState(100);
  const filtersHook = useListFilters("filters:meus-chamados");
  const { filters, applyTo, reset: resetFilters, hasActive, setStatus, setPriority, setDatePreset } = filtersHook;

  // Status, prioridade e período saíram desta tela (as pílulas cuidam do
  // escopo). Um valor salvo de uma visita antiga esconderia chamados.
  useEffect(() => {
    if (filters.status !== "all") setStatus("all");
    if (filters.priority !== "all") setPriority("all");
    if (filters.datePreset !== "all") setDatePreset("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTickets = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("tickets")
        .select("id, subject, description, status, priority, ticket_type, created_at, property_id, created_by, properties(name, cover_photo_url)")
        .or(await ownerScopeFilter(user.id))
        .or("cost_responsible.is.null,cost_responsible.eq.owner,cost_responsible.eq.pm,cost_responsible.eq.split")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTickets((data || []) as unknown as ChamadoProprietario[]);
    } catch (error) {
      console.error("Erro ao carregar chamados:", error);
      toast.error("Não foi possível carregar os chamados.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const contagens = useMemo(() => {
    const abertos = tickets.filter((t) => ticketAberto(t.status)).length;
    return { abertos, fechados: tickets.length - abertos };
  }, [tickets]);

  const daAba = useMemo(
    () => tickets.filter((t) => (aba === "abertos" ? ticketAberto(t.status) : !ticketAberto(t.status))),
    [tickets, aba],
  );

  const filtrados = useMemo(() => {
    let lista = applyTo(daAba, {
      searchFields: (t) => [t.subject, t.description, t.properties?.name],
      propertyId: (t) => t.property_id,
    });
    if (tipo !== "all") lista = lista.filter((t) => t.ticket_type === tipo);
    return lista;
  }, [daAba, applyTo, tipo]);

  useEffect(() => {
    setVisibleCount(100);
  }, [filtrados.length]);

  const visiveis = filtrados.slice(0, visibleCount);
  const ticketIds = useMemo(() => visiveis.map((t) => t.id), [visiveis]);
  const { unreadCounts, markAsRead } = useUnreadMessages(ticketIds);

  const propertyOptions = useMemo(() => {
    const map = new Map<string, string>();
    tickets.forEach((t) => {
      if (t.property_id && t.properties?.name) map.set(t.property_id, t.properties.name);
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [tickets]);

  const tiposDisponiveis = useMemo(() => {
    const presentes = new Set(tickets.map((t) => t.ticket_type));
    return ORDEM_TIPO_TICKET.filter((t) => presentes.has(t));
  }, [tickets]);

  // Manutenção aberta pela equipe: o proprietário acompanha pelo diálogo de
  // manutenção, não pela conversa do chamado.
  const manutencaoDaEquipe = (t: ChamadoProprietario) => t.ticket_type === "manutencao" && t.created_by !== user?.id;

  const abrirDetalhe = (t: ChamadoProprietario) => {
    saveScrollPosition(pathname);
    navigate(`/ticket-detalhes/${t.id}`);
  };

  const abrirDialogo = (t: ChamadoProprietario) => {
    setSelecionado(t);
    setDialogoAberto(true);
    markAsRead(t.id);
  };

  const abrirLinha = (t: ChamadoProprietario) => (manutencaoDaEquipe(t) ? abrirDialogo(t) : abrirDetalhe(t));

  const limparFiltros = () => {
    resetFilters();
    setTipo("all");
  };

  const filtrosAtivos = hasActive || tipo !== "all";
  const subtitulo = loading
    ? undefined
    : `${contagens.abertos} ${contagens.abertos === 1 ? "aberto" : "abertos"} · ${contagens.fechados} ${
        contagens.fechados === 1 ? "fechado" : "fechados"
      }`;

  return (
    <PaginaInterna
      largura="larga"
      comNavInferior
      cabecalho={
        <CabecalhoPagina
          titulo="Meus chamados"
          subtitulo={subtitulo}
          icone={<Ticket />}
          tom="info"
          voltarPara="/minha-caixa"
          acoes={
            <Button size="sm" className="h-9" onClick={() => navigate("/novo-ticket")} aria-label="Novo chamado">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Novo chamado</span>
            </Button>
          }
          abaixo={
            <BarraFiltros role="tablist" aria-label="Escopo dos chamados">
              <AbaPilula
                ativa={aba === "abertos"}
                quantidade={loading ? undefined : contagens.abertos}
                tom="info"
                onClick={() => setAba("abertos")}
              >
                Abertos
              </AbaPilula>
              <AbaPilula
                ativa={aba === "fechados"}
                quantidade={loading ? undefined : contagens.fechados}
                onClick={() => setAba("fechados")}
              >
                Fechados
              </AbaPilula>
            </BarraFiltros>
          }
        />
      }
    >
      <Card className="rounded-xl border-border/70 p-3 md:p-4">
        <ListFilters
          {...filtersHook}
          searchPlaceholder="Buscar por assunto ou imóvel…"
          propertyOptions={propertyOptions}
          totalCount={daAba.length}
          filteredCount={filtrados.length}
          extra={
            tiposDisponiveis.length > 0 && (
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger aria-label="Tipo de chamado">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent className="z-50 bg-popover">
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {tiposDisponiveis.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_TICKET[t].rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
          }
        />
      </Card>

      {loading ? (
        <Card className="rounded-xl border-border/70 p-3" aria-busy="true" aria-label="Carregando chamados">
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        </Card>
      ) : tickets.length === 0 ? (
        <Card className="rounded-xl border-border/70">
          <EmptyState
            ilustracao="chamados"
            title="Nenhum chamado ainda"
            description="Quando precisar de algo, abra um chamado e acompanhe a conversa com a equipe por aqui."
            action={
              <Button onClick={() => navigate("/novo-ticket")}>
                <Plus className="h-4 w-4" />
                Novo chamado
              </Button>
            }
          />
        </Card>
      ) : daAba.length === 0 ? (
        <Card className="rounded-xl border-border/70">
          <EmptyState
            ilustracao="chamados"
            title={aba === "abertos" ? "Nenhum chamado aberto" : "Nenhum chamado fechado"}
            description={
              aba === "abertos"
                ? "Tudo resolvido por enquanto. Os chamados concluídos ficam em Fechados."
                : "Os chamados concluídos ou cancelados aparecem aqui."
            }
            action={
              aba === "abertos" && (
                <Button onClick={() => navigate("/novo-ticket")}>
                  <Plus className="h-4 w-4" />
                  Novo chamado
                </Button>
              )
            }
          />
        </Card>
      ) : filtrados.length === 0 ? (
        <Card className="rounded-xl border-border/70">
          <EmptyState
            ilustracao="busca"
            title="Nenhum chamado com esses filtros"
            description="Mude a busca ou limpe os filtros para ver os demais."
            action={
              filtrosAtivos && (
                <Button variant="outline" onClick={limparFiltros}>
                  Limpar filtros
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          <Card className="rounded-xl border-border/70 p-2 md:p-3">
            <div className="space-y-1.5">
              {visiveis.map((t) => {
                const naoLidas = unreadCounts[t.id] || 0;
                const daEquipe = manutencaoDaEquipe(t);
                return (
                  <LinhaCaixa
                    key={t.id}
                    miniatura={<MiniaturaImovel url={t.properties?.cover_photo_url} fallback={<Building2 />} />}
                    titulo={t.subject}
                    subtitulo={`${t.properties?.name || "Sem imóvel"} · ${format(new Date(t.created_at), "dd/MM/yy", { locale: ptBR })}`}
                    meta={
                      <div className="flex flex-col items-end gap-1">
                        <EtiquetaStatusTicket status={t.status} />
                        <EtiquetaPrioridadeTicket prioridade={t.priority} />
                      </div>
                    }
                    acoes={
                      daEquipe ? (
                        <BotaoLinha rotulo="Ver manutenção" naoLidas={naoLidas} onClick={() => abrirDialogo(t)}>
                          <Wrench />
                        </BotaoLinha>
                      ) : (
                        <BotaoLinha rotulo="Abrir conversa" naoLidas={naoLidas} onClick={() => abrirDialogo(t)}>
                          <MessageSquare />
                        </BotaoLinha>
                      )
                    }
                    onClick={() => abrirLinha(t)}
                  />
                );
              })}
            </div>
          </Card>

          {filtrados.length > visibleCount && (
            <div className="flex justify-center pt-1">
              <Button variant="outline" onClick={() => setVisibleCount((v) => v + 100)}>
                Carregar mais ({filtrados.length - visibleCount} restantes)
              </Button>
            </div>
          )}
        </>
      )}

      {selecionado &&
        (manutencaoDaEquipe(selecionado) ? (
          <MaintenanceDetailsDialog open={dialogoAberto} onOpenChange={setDialogoAberto} maintenanceId={selecionado.id} />
        ) : (
          <MaintenanceChatDialog
            open={dialogoAberto}
            onOpenChange={setDialogoAberto}
            ticketId={selecionado.id}
            ticketSubject={selecionado.subject}
            propertyName={selecionado.properties?.name}
          />
        ))}
    </PaginaInterna>
  );
}
