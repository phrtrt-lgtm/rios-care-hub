import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { goBack } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, differenceInHours, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Search, Building, Clock, MessageSquare, HelpCircle, Calendar, DollarSign, Info, MessageCircle, ShoppingBag } from "lucide-react";
import { MaintenanceChatDialog } from "@/components/MaintenanceChatDialog";

type TicketStatus = "novo" | "em_analise" | "aguardando_info" | "em_execucao" | "concluido" | "cancelado";
type TicketType = "duvida" | "cobranca" | "financeiro" | "outros" | "conversar_hospedes" | "melhorias_compras";

interface OwnerTicket {
  id: string;
  subject: string;
  description: string;
  status: TicketStatus;
  ticket_type: TicketType;
  priority: string;
  created_at: string;
  sla_due_at: string | null;
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

const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  duvida: "Dúvida",
  cobranca: "Cobrança",
  
  financeiro: "Financeiro",
  outros: "Outros",
  conversar_hospedes: "Conversar c/ Hóspedes",
  melhorias_compras: "Melhorias/Compras",
};

const TICKET_TYPE_ICONS: Record<TicketType, React.ReactNode> = {
  duvida: <HelpCircle className="h-3 w-3" />,
  cobranca: <DollarSign className="h-3 w-3" />,
  
  financeiro: <DollarSign className="h-3 w-3" />,
  outros: <Info className="h-3 w-3" />,
  conversar_hospedes: <MessageCircle className="h-3 w-3" />,
  melhorias_compras: <ShoppingBag className="h-3 w-3" />,
};

const KANBAN_COLUMNS = [
  { 
    id: "novo", 
    label: "Novos", 
    statuses: ["novo"] as TicketStatus[],
    color: "bg-info/10 border-info/30/30"
  },
  { 
    id: "em_analise", 
    label: "Em Análise", 
    statuses: ["em_analise"] as TicketStatus[],
    color: "bg-warning/10 border-warning/30/30"
  },
  { 
    id: "aguardando_info", 
    label: "Aguardando Info", 
    statuses: ["aguardando_info"] as TicketStatus[],
    color: "bg-warning/10 border-warning/30/30"
  },
  { 
    id: "em_execucao", 
    label: "Em Execução", 
    statuses: ["em_execucao"] as TicketStatus[],
    color: "bg-primary/10 border-primary/30/30"
  },
];

const AdminChamadosKanban = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | TicketType>("all");
  const [chatDialogOpen, setChatDialogOpen] = useState(false);
  const [chatTicket, setChatTicket] = useState<OwnerTicket | null>(null);

  // Fetch owner tickets (excluding maintenance)
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
          sla_due_at,
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
              author_name: (lastMessage.author as any)?.name || "Desconhecido",
            } : null,
          };
        })
      );

      return ticketsWithMessages as OwnerTicket[];
    },
  });

  // Get ticket IDs for unread message tracking
  const ticketIds = useMemo(() => (tickets || []).map(t => t.id), [tickets]);
  const { unreadCounts, markAsRead } = useUnreadMessages(ticketIds);

  const openChatDialog = (ticket: OwnerTicket, e: React.MouseEvent) => {
    e.stopPropagation();
    setChatTicket(ticket);
    setChatDialogOpen(true);
    markAsRead(ticket.id);
  };

  // Organize tickets into columns
  const columns = useMemo(() => {
    if (!tickets) return KANBAN_COLUMNS.map((col) => ({ ...col, tickets: [] }));

    return KANBAN_COLUMNS.map((col) => {
      let columnTickets = tickets.filter((t) => col.statuses.includes(t.status));

      // Apply search filter
      if (search) {
        const searchLower = search.toLowerCase();
        columnTickets = columnTickets.filter(
          (t) =>
            t.subject.toLowerCase().includes(searchLower) ||
            t.property?.name.toLowerCase().includes(searchLower) ||
            t.owner?.name.toLowerCase().includes(searchLower)
        );
      }

      // Apply type filter
      if (typeFilter !== "all") {
        columnTickets = columnTickets.filter((t) => t.ticket_type === typeFilter);
      }

      // Sort by SLA (closest expiration first)
      columnTickets.sort((a, b) => {
        if (!a.sla_due_at && !b.sla_due_at) return 0;
        if (!a.sla_due_at) return 1;
        if (!b.sla_due_at) return -1;
        return new Date(a.sla_due_at).getTime() - new Date(b.sla_due_at).getTime();
      });

      return { ...col, tickets: columnTickets };
    });
  }, [tickets, search, typeFilter]);


  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => goBack(navigate, "/painel")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-2xl font-bold">Quadro de Chamados</h1>
            <p className="text-muted-foreground text-sm">
              Acompanhe e responda chamados dos proprietários
            </p>
          </div>
          <Button variant="secondary" onClick={() => navigate("/todos-tickets")}>
            Ver Todos os Tickets
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por unidade, proprietário ou assunto..."
              className="pl-10"
            />
          </div>
          <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Tipo de Chamado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Tipos</SelectItem>
              {Object.entries(TICKET_TYPE_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Kanban Board */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-muted/50 rounded-lg p-4 animate-pulse">
                <div className="h-6 bg-muted rounded w-1/2 mb-4" />
                <div className="space-y-3">
                  <div className="h-32 bg-muted rounded" />
                  <div className="h-32 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {columns.map((column) => (
              <div
                key={column.id}
                className={`rounded-lg border-2 ${column.color} p-3`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">{column.label}</h3>
                  <Badge variant="secondary">{column.tickets.length}</Badge>
                </div>

                <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto">
                  {column.tickets.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhum chamado
                    </p>
                  ) : (
                    column.tickets.map((ticket) => {
                      return (
                        <Card
                          key={ticket.id}
                          className="cursor-pointer hover:shadow-md transition-shadow"
                          onClick={() => navigate(`/ticket-detalhes/${ticket.id}`)}
                        >
                          <CardContent className="p-3 space-y-2">
                            {/* Property */}
                            <div className="flex items-center gap-2">
                              {ticket.property?.cover_photo_url ? (
                                <img
                                  src={ticket.property.cover_photo_url}
                                  alt=""
                                  className="w-8 h-8 rounded object-cover"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
                                  <Building className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                              <span className="text-sm font-medium truncate flex-1">
                                {ticket.property?.name || "Sem unidade"}
                              </span>
                            </div>

                            {/* Ticket Type Badge */}
                            <div className="flex items-center gap-1">
                              <Badge variant="outline" className="text-xs gap-1">
                                {TICKET_TYPE_ICONS[ticket.ticket_type]}
                                {TICKET_TYPE_LABELS[ticket.ticket_type]}
                              </Badge>
                            </div>

                            {/* Subject */}
                            <p className="text-sm font-medium line-clamp-2">{ticket.subject}</p>

                            {/* Last Message */}
                            {ticket.last_message && (
                              <div className="bg-muted/50 rounded p-2 text-xs">
                                <p className="text-muted-foreground truncate">
                                  <span className="font-medium">{ticket.last_message.author_name}:</span>{" "}
                                  {ticket.last_message.body}
                                </p>
                              </div>
                            )}


                            {/* Owner */}
                            <p className="text-xs text-muted-foreground">
                              {ticket.owner?.name || "Sem proprietário"}
                            </p>

                            {/* Chat button */}
                            <div className="flex flex-wrap gap-1 mt-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 text-xs h-7 relative"
                                onClick={(e) => openChatDialog(ticket, e)}
                              >
                                <MessageSquare className="h-3 w-3 mr-1" />
                                Responder
                                {unreadCounts[ticket.id] > 0 && (
                                  <span className="absolute -top-1 -right-1 bg-destructive text-white text-[8px] rounded-full h-4 min-w-[16px] flex items-center justify-center px-1 font-bold">
                                    {unreadCounts[ticket.id] > 9 ? "9+" : unreadCounts[ticket.id]}
                                  </span>
                                )}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chat Dialog */}
      <MaintenanceChatDialog
        open={chatDialogOpen}
        onOpenChange={setChatDialogOpen}
        ticketId={chatTicket?.id || null}
        ticketSubject={chatTicket?.subject || ""}
        propertyName={chatTicket?.property?.name || "Sem unidade"}
      />
    </div>
  );
};

export default AdminChamadosKanban;
