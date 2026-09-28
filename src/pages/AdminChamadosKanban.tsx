import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Building2, Inbox, Kanban, List, MessageSquare, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { saveScrollPosition } from "@/lib/navigation";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MaintenanceChatDialog } from "@/components/MaintenanceChatDialog";
import { BarraFiltros, CabecalhoPagina, PaginaInterna } from "@/components/painel/PaginaInterna";
import { CaixaVazia, GrupoCaixa, MiniaturaImovel } from "@/components/painel/CaixaOperacao";
import { EtiquetaPrioridadeTicket, EtiquetaTipoTicket } from "@/components/tickets/EtiquetasTicket";
import { ORDEM_TIPO_TICKET, STATUS_TICKET, STATUS_TICKET_ABERTOS, TIPO_TICKET } from "@/lib/ticketMeta";
import { cn } from "@/lib/utils";

interface ChamadoQuadro {
  id: string;
  subject: string;
  description: string | null;
  status: string;
  ticket_type: string;
  priority: string;
  created_at: string;
  property: {
    id: string;
    name: string;
    cover_photo_url: string | null;
  } | null;
  owner: {
    id: string;
    name: string;
  } | null;
  last_message?: {
    body: string;
    created_at: string;
    author_name: string;
  } | null;
}

/** O quadro não mostra manutenções: elas têm lista própria. */
const TIPOS_DO_QUADRO = ORDEM_TIPO_TICKET.filter((t) => t !== "manutencao");

/** Prévia da última mensagem sem os tokens de menção e de negrito. */
const resumoMensagem = (body: string) =>
  body.replace(/@\[([^\]]+)\]\([0-9a-f-]+\)/g, "@$1").replace(/\*\*/g, "").trim();

const AdminChamadosKanban = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [chatDialogOpen, setChatDialogOpen] = useState(false);
  const [chatTicket, setChatTicket] = useState<ChamadoQuadro | null>(null);

  // Chamados abertos dos proprietários (sem manutenção)
  const { data: tickets, isLoading } = useQuery({
    queryKey: ["owner-tickets-kanban"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(`
          id,
          subject,
          description,
          status,
          ticket_type,
          priority,
          created_at,
          property:properties(id, name, cover_photo_url),
          owner:profiles!tickets_owner_id_fkey(id, name)
        `)
        .neq("ticket_type", "manutencao")
        .neq("status", "cancelado")
        .neq("status", "concluido")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch last message for each ticket
      const ticketsWithMessages = await Promise.all(
        (data || []).map(async (ticket) => {
          const { data: messages } = await supabase
            .from("ticket_messages")
            .select(`
              body,
              created_at,
              author:profiles!ticket_messages_author_id_fkey(name)
            `)
            .eq("ticket_id", ticket.id)
            .eq("is_internal", false)
            .order("created_at", { ascending: false })
            .limit(1);

          const lastMessage = messages?.[0];
          return {
            ...ticket,
            last_message: lastMessage ? {
              body: lastMessage.body,
              created_at: lastMessage.created_at,
              author_name: (lastMessage.author as { name?: string } | null)?.name || "Desconhecido",
            } : null,
          };
        })
      );

      return ticketsWithMessages as unknown as ChamadoQuadro[];
    },
  });

  // Get ticket IDs for unread message tracking
  const ticketIds = useMemo(() => (tickets || []).map(t => t.id), [tickets]);
  const { unreadCounts, markAsRead } = useUnreadMessages(ticketIds);

  const abrirConversa = (ticket: ChamadoQuadro) => {
    setChatTicket(ticket);
    setChatDialogOpen(true);
    markAsRead(ticket.id);
  };

  const abrirDetalhe = (ticket: ChamadoQuadro) => {
    saveScrollPosition(pathname);
    navigate(`/ticket-detalhes/${ticket.id}`);
  };

  // Uma coluna por status aberto, na ordem do vocabulário único.
  const colunas = useMemo(() => {
    const busca = search.trim().toLowerCase();
    return STATUS_TICKET_ABERTOS.map((status) => {
      let itens = (tickets || []).filter((t) => t.status === status);

      if (busca) {
        itens = itens.filter(
          (t) =>
            t.subject.toLowerCase().includes(busca) ||
            t.property?.name.toLowerCase().includes(busca) ||
            t.owner?.name.toLowerCase().includes(busca),
        );
      }

      if (typeFilter !== "all") {
        itens = itens.filter((t) => t.ticket_type === typeFilter);
      }

      // Urgentes no topo; depois os mais recentes (a consulta já vem por data).
      itens = [...itens].sort((a, b) => Number(b.priority === "urgente") - Number(a.priority === "urgente"));

      return { status, rotulo: STATUS_TICKET[status].rotulo, tom: STATUS_TICKET[status].tom, itens };
    });
  }, [tickets, search, typeFilter]);

  const totalAbertos = tickets?.length ?? 0;
  const totalUrgentes = (tickets || []).filter((t) => t.priority === "urgente").length;
  const subtitulo = isLoading
    ? undefined
    : `${totalAbertos} ${totalAbertos === 1 ? "aberto" : "abertos"}${
        totalUrgentes > 0 ? ` · ${totalUrgentes} urgente${totalUrgentes === 1 ? "" : "s"}` : ""
      }`;

  return (
    <PaginaInterna
      largura="larga"
      comNavInferior
      cabecalho={
        <CabecalhoPagina
          titulo="Quadro de chamados"
          subtitulo={subtitulo}
          icone={<Kanban />}
          tom="info"
          voltarPara="/painel"
          acoes={
            <Button variant="outline" size="sm" className="h-9" onClick={() => navigate("/todos-tickets")}>
              <List className="h-4 w-4" />
              Lista
            </Button>
          }
          abaixo={
            <BarraFiltros>
              <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por assunto, imóvel ou proprietário…"
                  aria-label="Buscar chamados"
                  className="h-8 pl-8 text-sm"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-8 w-[180px] shrink-0 text-xs" aria-label="Tipo de chamado">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent className="z-50 bg-popover">
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {TIPOS_DO_QUADRO.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_TICKET[t].rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </BarraFiltros>
          }
        />
      }
    >
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Carregando quadro">
          {STATUS_TICKET_ABERTOS.map((s) => (
            <SectionSkeleton key={s} rows={2} showHeader />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {colunas.map((coluna) => (
            <Card key={coluna.status} className="rounded-xl border-border/70 p-3">
              <GrupoCaixa titulo={coluna.rotulo} quantidade={coluna.itens.length} tom={coluna.tom}>
                {/* No celular as colunas empilham com altura automática; só no desktop cada coluna rola. */}
                <div className="space-y-2 xl:max-h-[calc(100vh-14rem)] xl:overflow-y-auto xl:pr-0.5">
                  {coluna.itens.length === 0 ? (
                    <CaixaVazia icone={<Inbox className="h-5 w-5" />} titulo="Nenhum chamado" />
                  ) : (
                    coluna.itens.map((ticket) => {
                      const naoLidas = unreadCounts[ticket.id] || 0;
                      const urgente = ticket.priority === "urgente";
                      return (
                        <div
                          key={ticket.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => abrirDetalhe(ticket)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              abrirDetalhe(ticket);
                            }
                          }}
                          className={cn(
                            "cursor-pointer rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            urgente ? "border-destructive/40" : "border-border/70",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <MiniaturaImovel
                              url={ticket.property?.cover_photo_url}
                              fallback={<Building2 />}
                              tamanho="h-8 w-8"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium">{ticket.property?.name || "Sem imóvel"}</p>
                              <p className="truncate text-[11px] text-muted-foreground">
                                {ticket.owner?.name || "Sem proprietário"}
                              </p>
                            </div>
                          </div>

                          <p className="mt-2 line-clamp-2 text-[13px] font-medium leading-snug">{ticket.subject}</p>

                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            <EtiquetaPrioridadeTicket prioridade={ticket.priority} />
                            <EtiquetaTipoTicket tipo={ticket.ticket_type} />
                            <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                              {format(new Date(ticket.created_at), "dd/MM", { locale: ptBR })}
                            </span>
                          </div>

                          {ticket.last_message && (
                            <p className="mt-2 line-clamp-2 rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
                              <span className="font-medium text-foreground/80">{ticket.last_message.author_name}:</span>{" "}
                              {resumoMensagem(ticket.last_message.body)}
                            </p>
                          )}

                          <div className="mt-2 flex justify-end" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant="outline"
                              className="relative h-7 text-xs"
                              onClick={() => abrirConversa(ticket)}
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                              Responder
                              {naoLidas > 0 && (
                                <span
                                  className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground"
                                  aria-label={`${naoLidas} não lidas`}
                                >
                                  {naoLidas > 9 ? "9+" : naoLidas}
                                </span>
                              )}
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </GrupoCaixa>
            </Card>
          ))}
        </div>
      )}

      <MaintenanceChatDialog
        open={chatDialogOpen}
        onOpenChange={setChatDialogOpen}
        ticketId={chatTicket?.id || null}
        ticketSubject={chatTicket?.subject || ""}
        propertyName={chatTicket?.property?.name || "Sem imóvel"}
      />
    </PaginaInterna>
  );
};

export default AdminChamadosKanban;
