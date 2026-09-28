import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { saveScrollPosition } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, ExternalLink, Kanban, MessageSquare, Plus, Ticket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MaintenanceChatDialog } from "@/components/MaintenanceChatDialog";
import { ListFilters } from "@/components/list/ListFilters";
import { useListFilters } from "@/hooks/useListFilters";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { AbaPilula, BarraFiltros, CabecalhoPagina, PaginaInterna } from "@/components/painel/PaginaInterna";
import { BotaoLinha, LinhaCaixa, MiniaturaImovel } from "@/components/painel/CaixaOperacao";
import { EtiquetaPrioridadeTicket, EtiquetaStatusTicket, EtiquetaTipoTicket } from "@/components/tickets/EtiquetasTicket";
import {
  ORDEM_STATUS_TICKET,
  ORDEM_TIPO_TICKET,
  STATUS_TICKET,
  TIPO_TICKET,
  ticketAberto,
  type StatusTicket,
} from "@/lib/ticketMeta";

interface Ticket {
  id: string;
  subject: string;
  description: string | null;
  status: string;
  priority: string;
  ticket_type: string;
  created_at: string;
  owner: { id: string; name: string; email: string } | null;
  property: { id: string; name: string; address: string | null; cover_photo_url: string | null } | null;
}

/** Pílulas do cabeçalho: escopo de status. "abertos" não é status do banco. */
const ESCOPOS: Array<{ valor: string; rotulo: string }> = [
  { valor: "abertos", rotulo: "Abertos" },
  { valor: "concluido", rotulo: "Concluídos" },
  { valor: "cancelado", rotulo: "Cancelados" },
  { valor: "all", rotulo: "Todos" },
];

const TodosTickets = () => {
  useScrollRestoration();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const filtersHook = useListFilters("filters:todos-tickets");
  const { filters, debouncedSearch, applyTo, reset: resetFilters, setStatus, setPriority, hasActive } = filtersHook;
  const [searchParams, setSearchParams] = useSearchParams();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("recent");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [excluindo, setExcluindo] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [atualizandoStatus, setAtualizandoStatus] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [ticketChat, setTicketChat] = useState<Ticket | null>(null);
  const [visibleCount, setVisibleCount] = useState(100);

  const ehAdmin = profile?.role === "admin";

  useEffect(() => {
    if (!user || !["admin", "agent"].includes(profile?.role || "")) {
      navigate("/");
      return;
    }
    fetchTickets();
  }, [user, profile, navigate]);

  // Links do painel chegam com ?priority= e ?status= (ex.: "Urgentes abertos").
  // Aplica uma vez, a partir de filtros limpos — senão uma busca salva de outra
  // visita esconderia itens e o número não bateria com o do painel — e tira os
  // parâmetros da URL, para não sobrescrever o filtro ao voltar de um ticket.
  useEffect(() => {
    const priority = searchParams.get("priority");
    const status = searchParams.get("status");
    if (!priority && !status) return;
    resetFilters();
    if (priority) setPriority(priority);
    if (status) setStatus(status);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, resetFilters, setPriority, setStatus]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      // Uma consulta só, com proprietário e imóvel embutidos. Antes eram
      // quatro consultas por chamado.
      const { data, error } = await supabase
        .from("tickets")
        .select(
          `
          id, subject, description, status, priority, ticket_type, created_at,
          owner:profiles!tickets_owner_id_fkey(id, name, email),
          property:properties(id, name, address, cover_photo_url)
        `,
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTickets((data || []) as unknown as Ticket[]);
    } catch (error) {
      console.error("Erro ao carregar chamados:", error);
      toast.error("Não foi possível carregar os chamados.");
    } finally {
      setLoading(false);
    }
  };

  const filtrados = useMemo(() => {
    const soAbertos = filters.status === "abertos";
    let lista = applyTo(tickets, {
      searchFields: (t) => [t.subject, t.description, t.owner?.name, t.property?.name],
      status: soAbertos ? undefined : (t) => t.status,
      priority: (t) => t.priority,
      propertyId: (t) => t.property?.id ?? null,
      date: (t) => t.created_at,
    });
    if (soAbertos) lista = lista.filter((t) => ticketAberto(t.status));
    if (typeFilter !== "all") lista = lista.filter((t) => t.ticket_type === typeFilter);

    // Abertos primeiro; dentro de cada grupo, a ordenação escolhida.
    return [...lista].sort((a, b) => {
      const aAberto = ticketAberto(a.status);
      const bAberto = ticketAberto(b.status);
      if (aAberto !== bAberto) return aAberto ? -1 : 1;
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return sortBy === "oldest" ? ta - tb : tb - ta;
    });
  }, [tickets, applyTo, filters.status, typeFilter, sortBy, debouncedSearch]);

  useEffect(() => {
    setVisibleCount(100);
  }, [filtrados.length]);

  const visiveis = filtrados.slice(0, visibleCount);
  const ticketIds = useMemo(() => visiveis.map((t) => t.id), [visiveis]);
  const { unreadCounts, markAsRead } = useUnreadMessages(ticketIds);

  const contagens = useMemo(() => {
    const abertos = tickets.filter((t) => ticketAberto(t.status));
    return {
      abertos: abertos.length,
      urgentes: abertos.filter((t) => t.priority === "urgente").length,
      concluido: tickets.filter((t) => t.status === "concluido").length,
      cancelado: tickets.filter((t) => t.status === "cancelado").length,
      all: tickets.length,
    };
  }, [tickets]);

  const propertyOptions = useMemo(() => {
    const map = new Map<string, string>();
    tickets.forEach((t) => {
      if (t.property?.id) map.set(t.property.id, t.property.name);
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [tickets]);

  const abrirDetalhe = useCallback(
    (ticket: Ticket) => {
      saveScrollPosition(pathname);
      navigate(`/ticket-detalhes/${ticket.id}`);
    },
    [navigate, pathname],
  );

  const abrirChat = (ticket: Ticket) => {
    setTicketChat(ticket);
    setChatOpen(true);
  };

  const fecharChat = (aberto: boolean) => {
    setChatOpen(aberto);
    if (!aberto && ticketChat) markAsRead(ticketChat.id);
  };

  const alternarSelecao = (id: string) => {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  };

  const todosVisiveisSelecionados = visiveis.length > 0 && visiveis.every((t) => selecionados.has(t.id));
  const alternarTodos = () => {
    setSelecionados(todosVisiveisSelecionados ? new Set() : new Set(visiveis.map((t) => t.id)));
  };

  const excluirSelecionados = async () => {
    if (!ehAdmin || selecionados.size === 0) return;
    setExcluindo(true);
    try {
      const { error } = await supabase.from("tickets").delete().in("id", Array.from(selecionados));
      if (error) throw error;
      toast.success(`${selecionados.size} chamado(s) excluído(s)`);
      setSelecionados(new Set());
      setConfirmarExclusao(false);
      await fetchTickets();
    } catch (error) {
      console.error("Erro ao excluir chamados:", error);
      toast.error("Erro ao excluir chamados");
    } finally {
      setExcluindo(false);
    }
  };

  const mudarStatusEmLote = async (novo: StatusTicket) => {
    if (selecionados.size === 0) return;
    setAtualizandoStatus(true);
    try {
      const { error } = await supabase.from("tickets").update({ status: novo }).in("id", Array.from(selecionados));
      if (error) throw error;
      toast.success(`${selecionados.size} chamado(s) marcado(s) como ${STATUS_TICKET[novo].rotulo.toLowerCase()}`);
      setSelecionados(new Set());
      await fetchTickets();
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
      toast.error("Erro ao atualizar o status");
    } finally {
      setAtualizandoStatus(false);
    }
  };

  const subtitulo = loading
    ? undefined
    : `${contagens.abertos} ${contagens.abertos === 1 ? "aberto" : "abertos"}${
        contagens.urgentes > 0 ? ` · ${contagens.urgentes} urgente${contagens.urgentes === 1 ? "" : "s"}` : ""
      }`;

  const acoesCabecalho =
    selecionados.size > 0 ? (
      <>
        <Select onValueChange={(v) => mudarStatusEmLote(v as StatusTicket)} disabled={atualizandoStatus}>
          <SelectTrigger className="h-9 w-[170px]" aria-label="Alterar status dos selecionados">
            <SelectValue placeholder={`Status (${selecionados.size})`} />
          </SelectTrigger>
          <SelectContent className="z-50 bg-popover">
            {ORDEM_STATUS_TICKET.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_TICKET[s].rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {ehAdmin && (
          <Button variant="destructive" size="sm" className="h-9" onClick={() => setConfirmarExclusao(true)} disabled={excluindo}>
            <Trash2 className="h-4 w-4" />
            Excluir {selecionados.size}
          </Button>
        )}
      </>
    ) : (
      <>
        <Button variant="outline" size="sm" className="hidden h-9 sm:inline-flex" onClick={() => navigate("/admin/chamados")}>
          <Kanban className="h-4 w-4" />
          Quadro
        </Button>
        <Button size="sm" className="h-9" onClick={() => navigate("/novo-ticket-massa")}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Novo chamado</span>
        </Button>
      </>
    );

  const formatarCriado = (iso: string) => format(new Date(iso), "dd/MM/yy", { locale: ptBR });

  return (
    <PaginaInterna
      largura="larga"
      comNavInferior
      cabecalho={
        <CabecalhoPagina
          titulo="Chamados"
          subtitulo={subtitulo}
          icone={<Ticket />}
          tom="info"
          voltarPara="/painel"
          acoes={acoesCabecalho}
          abaixo={
            <BarraFiltros role="tablist" aria-label="Escopo dos chamados">
              {ESCOPOS.map((e) => (
                <AbaPilula
                  key={e.valor}
                  ativa={filters.status === e.valor}
                  quantidade={loading ? undefined : contagens[e.valor as keyof typeof contagens]}
                  tom={e.valor === "abertos" ? "info" : "neutral"}
                  onClick={() => setStatus(e.valor)}
                >
                  {e.rotulo}
                </AbaPilula>
              ))}
            </BarraFiltros>
          }
        />
      }
    >
      <Card className="rounded-xl border-border/70 p-3 md:p-4">
        <ListFilters
          {...filtersHook}
          searchPlaceholder="Buscar por assunto, proprietário ou imóvel…"
          statusOptions={[
            { value: "abertos", label: "Abertos (qualquer etapa)" },
            ...ORDEM_STATUS_TICKET.map((s) => ({ value: s, label: STATUS_TICKET[s].rotulo })),
          ]}
          priorityOptions={[
            { value: "normal", label: "Normal" },
            { value: "urgente", label: "Urgente" },
          ]}
          propertyOptions={propertyOptions}
          showDateRange
          totalCount={tickets.length}
          filteredCount={filtrados.length}
          extra={
            <>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger aria-label="Tipo de chamado">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent className="z-50 bg-popover">
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {ORDEM_TIPO_TICKET.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_TICKET[t].rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger aria-label="Ordenação">
                  <SelectValue placeholder="Ordenar por" />
                </SelectTrigger>
                <SelectContent className="z-50 bg-popover">
                  <SelectItem value="recent">Mais recentes</SelectItem>
                  <SelectItem value="oldest">Mais antigos</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
        />
      </Card>

      {loading ? (
        <Card className="rounded-xl border-border/70 p-3" aria-busy="true" aria-label="Carregando chamados">
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        </Card>
      ) : tickets.length === 0 ? (
        <Card className="rounded-xl border-border/70">
          <EmptyState
            ilustracao="chamados"
            title="Nenhum chamado ainda"
            description="Os chamados dos proprietários e da equipe aparecem aqui."
            action={
              <Button onClick={() => navigate("/novo-ticket-massa")}>
                <Plus className="h-4 w-4" />
                Novo chamado
              </Button>
            }
          />
        </Card>
      ) : filtrados.length === 0 ? (
        <Card className="rounded-xl border-border/70">
          <EmptyState
            ilustracao="busca"
            title="Nenhum chamado com esses filtros"
            description="Mude o escopo acima ou limpe os filtros para ver os demais."
            action={
              (hasActive || typeFilter !== "all") && (
                <Button
                  variant="outline"
                  onClick={() => {
                    resetFilters();
                    setTypeFilter("all");
                  }}
                >
                  Limpar filtros
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          {/* Desktop: tabela */}
          <Card className="hidden overflow-hidden rounded-xl border-border/70 md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-10 pl-4">
                    <Checkbox
                      checked={todosVisiveisSelecionados}
                      onCheckedChange={alternarTodos}
                      aria-label="Selecionar todos os chamados visíveis"
                    />
                  </TableHead>
                  <TableHead className="min-w-[200px]">Imóvel</TableHead>
                  <TableHead className="min-w-[260px]">Assunto</TableHead>
                  <TableHead className="w-[150px]">Status</TableHead>
                  <TableHead className="w-[90px]">Aberto em</TableHead>
                  <TableHead className="w-[90px] pr-4 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((ticket) => {
                  const naoLidas = unreadCounts[ticket.id] || 0;
                  const selecionado = selecionados.has(ticket.id);
                  return (
                    <TableRow
                      key={ticket.id}
                      className={`cursor-pointer ${selecionado ? "bg-primary/5" : ""}`}
                      onClick={() => abrirDetalhe(ticket)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") abrirDetalhe(ticket);
                      }}
                      tabIndex={0}
                    >
                      <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selecionado}
                          onCheckedChange={() => alternarSelecao(ticket.id)}
                          aria-label={`Selecionar ${ticket.subject}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <MiniaturaImovel url={ticket.property?.cover_photo_url} fallback={<Building2 />} tamanho="h-9 w-9" />
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium">{ticket.property?.name || "Sem imóvel"}</p>
                            <p className="truncate text-xs text-muted-foreground">{ticket.owner?.name || "—"}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="line-clamp-1 text-[13px] font-medium">{ticket.subject}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <EtiquetaTipoTicket tipo={ticket.ticket_type} />
                          <EtiquetaPrioridadeTicket prioridade={ticket.priority} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <EtiquetaStatusTicket status={ticket.status} />
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">{formatarCriado(ticket.created_at)}</TableCell>
                      <TableCell className="pr-4">
                        <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                          <BotaoLinha rotulo="Abrir conversa" naoLidas={naoLidas} onClick={() => abrirChat(ticket)}>
                            <MessageSquare />
                          </BotaoLinha>
                          <BotaoLinha rotulo="Ver detalhes" onClick={() => abrirDetalhe(ticket)}>
                            <ExternalLink />
                          </BotaoLinha>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {/* Celular: cartões */}
          <div className="space-y-1.5 md:hidden">
            {visiveis.map((ticket) => (
              <LinhaCaixa
                key={ticket.id}
                miniatura={<MiniaturaImovel url={ticket.property?.cover_photo_url} fallback={<Building2 />} />}
                titulo={ticket.subject}
                subtitulo={
                  <>
                    {ticket.property?.name || "Sem imóvel"}
                    {ticket.owner?.name ? ` · ${ticket.owner.name}` : ""}
                  </>
                }
                meta={
                  <div className="flex flex-col items-end gap-1">
                    <EtiquetaStatusTicket status={ticket.status} />
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <EtiquetaPrioridadeTicket prioridade={ticket.priority} />
                      {formatarCriado(ticket.created_at)}
                    </span>
                  </div>
                }
                acoes={
                  <BotaoLinha rotulo="Abrir conversa" naoLidas={unreadCounts[ticket.id] || 0} onClick={() => abrirChat(ticket)}>
                    <MessageSquare />
                  </BotaoLinha>
                }
                onClick={() => abrirDetalhe(ticket)}
                className="bg-card"
              />
            ))}
          </div>

          {filtrados.length > visibleCount && (
            <div className="flex justify-center pt-1">
              <Button variant="outline" onClick={() => setVisibleCount((v) => v + 100)}>
                Carregar mais ({filtrados.length - visibleCount} restantes)
              </Button>
            </div>
          )}
        </>
      )}

      <MaintenanceChatDialog
        open={chatOpen}
        onOpenChange={fecharChat}
        ticketId={ticketChat?.id || null}
        ticketSubject={ticketChat?.subject}
        propertyName={ticketChat?.property?.name}
      />

      <ConfirmationDialog
        open={confirmarExclusao}
        onOpenChange={setConfirmarExclusao}
        title={`Excluir ${selecionados.size} chamado(s)?`}
        description="A exclusão é definitiva e apaga também as mensagens e os anexos."
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={excluirSelecionados}
        loading={excluindo}
      />
    </PaginaInterna>
  );
};

export default TodosTickets;
