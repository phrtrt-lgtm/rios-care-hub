import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { goBack } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Building2, Clock, MessageSquare, ChevronRight, Ticket } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { TicketBadges } from "@/components/TicketBadges";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LoadingScreen } from "@/components/LoadingScreen";
import { MaintenanceChatDialog } from "@/components/MaintenanceChatDialog";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { ListFilters } from "@/components/list/ListFilters";
import { useListFilters } from "@/hooks/useListFilters";

const statusLabels: Record<string, string> = {
  novo: "Novo",
  em_analise: "Em Análise",
  aguardando_info: "Aguardando Info",
  em_execucao: "Em Execução",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

const typeLabels: Record<string, string> = {
  duvida: "Dúvida/Info",
  conversar_hospedes: "Hóspedes",
  
  manutencao: "Manutenção",
  melhorias_compras: "Melhorias",
  cobranca: "Cobrança",
  financeiro: "Financeiro",
  outros: "Outros",
};

const typeColors: Record<string, string> = {
  duvida: "bg-secondary text-secondary-foreground",
  conversar_hospedes: "bg-secondary text-secondary-foreground",
  
  manutencao: "bg-primary text-primary-foreground",
  melhorias_compras: "bg-primary text-primary-foreground",
  cobranca: "bg-destructive text-destructive-foreground",
  financeiro: "bg-destructive text-destructive-foreground",
  outros: "bg-muted text-muted-foreground",
};

export default function MeusChamados() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("abertos");
  const [ticketTypeFilter, setTicketTypeFilter] = useState("todos");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [visibleCount, setVisibleCount] = useState(100);
  const filtersHook = useListFilters("filters:meus-chamados");
  const { applyTo } = filtersHook;

  const ticketIds = tickets.map(t => t.id);
  const { unreadCounts, markAsRead } = useUnreadMessages(ticketIds);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (user) {
      fetchTickets();
    }
  }, [user, activeTab, ticketTypeFilter]);

  const fetchTickets = async () => {
    setLoading(true);
    let query = supabase
      .from("tickets")
      .select("*, properties(name, cover_photo_url), kind, essential, owner_decision, owner_action_due_at, sla_due_at, cost_responsible")
      .eq("owner_id", user?.id)
      .or("cost_responsible.is.null,cost_responsible.eq.owner,cost_responsible.eq.pm,cost_responsible.eq.split");

    if (activeTab === "abertos") {
      query = query.in("status", ["novo", "em_analise", "aguardando_info", "em_execucao"]);
    } else {
      query = query.in("status", ["concluido", "cancelado"]);
    }

    if (ticketTypeFilter !== "todos") {
      query = query.eq("ticket_type", ticketTypeFilter as any);
    }

    const { data, error } = await query;

    if (!error && data) {
      const ticketsWithMessages = await Promise.all(
        data.map(async (ticket) => {
          const { data: messages } = await supabase
            .from("ticket_messages")
            .select("body, created_at")
            .eq("ticket_id", ticket.id)
            .order("created_at", { ascending: false })
            .limit(1);
          
          return {
            ...ticket,
            lastMessage: messages?.[0] || null,
          };
        })
      );

      ticketsWithMessages.sort((a, b) => {
        const aIsOpen = ["novo", "em_analise", "aguardando_info", "em_execucao"].includes(a.status);
        const bIsOpen = ["novo", "em_analise", "aguardando_info", "em_execucao"].includes(b.status);
        
        if (aIsOpen && !bIsOpen) return -1;
        if (!aIsOpen && bIsOpen) return 1;
        
        if (!a.sla_due_at && !b.sla_due_at) return 0;
        if (!a.sla_due_at) return 1;
        if (!b.sla_due_at) return -1;
        return new Date(a.sla_due_at).getTime() - new Date(b.sla_due_at).getTime();
      });

      setTickets(ticketsWithMessages);
    }
    setLoading(false);
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "novo":
        return "bg-secondary text-secondary-foreground";
      case "em_analise":
        return "bg-primary/80 text-primary-foreground";
      case "aguardando_info":
        return "bg-primary text-primary-foreground";
      case "em_execucao":
        return "bg-secondary/80 text-secondary-foreground";
      case "concluido":
        return "bg-success text-white";
      case "cancelado":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };


  const openChat = (ticket: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTicket(ticket);
    setChatOpen(true);
    markAsRead(ticket.id);
  };

  if (loading) {
    return <LoadingScreen message="Carregando chamados..." />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary/5 via-background to-primary/5">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => goBack(navigate, "/minha-caixa")}
                className="shrink-0"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-lg font-semibold text-secondary">Meus Chamados</h1>
                <p className="text-xs text-muted-foreground">
                  {tickets.length} {tickets.length === 1 ? "chamado" : "chamados"}
                </p>
              </div>
            </div>
            <Button size="sm" onClick={() => navigate("/novo-ticket")} className="bg-primary hover:bg-primary/90">
              <Plus className="h-4 w-4 mr-1" />
              Novo
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4">
        <div className="space-y-3">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-9">
              <TabsTrigger value="abertos" className="text-sm">Abertos</TabsTrigger>
              <TabsTrigger value="fechados" className="text-sm">Fechados</TabsTrigger>
            </TabsList>
          </Tabs>

          <Tabs value={ticketTypeFilter} onValueChange={setTicketTypeFilter}>
            <TabsList className="flex-wrap h-auto gap-1 p-1">
              <TabsTrigger value="todos" className="text-xs h-7 px-2">Todos</TabsTrigger>
              <TabsTrigger value="manutencao" className="text-xs h-7 px-2">Manutenção</TabsTrigger>
              
              <TabsTrigger value="duvida" className="text-xs h-7 px-2">Dúvida</TabsTrigger>
              <TabsTrigger value="financeiro" className="text-xs h-7 px-2">Financeiro</TabsTrigger>
              <TabsTrigger value="outros" className="text-xs h-7 px-2">Outros</TabsTrigger>
            </TabsList>
          </Tabs>

          {(() => {
            const propertyOptions = Array.from(
              new Map(tickets.filter(t => t.properties?.name && t.property_id).map(t => [t.property_id, t.properties.name as string])).entries()
            ).map(([value, label]) => ({ value, label }));
            const filteredTickets = applyTo(tickets, {
              searchFields: (t: any) => [t.subject, t.description, t.properties?.name],
              status: (t: any) => t.status,
              priority: (t: any) => t.priority,
              propertyId: (t: any) => t.property_id,
              date: (t: any) => t.created_at,
            });
            const visibleTickets = filteredTickets.slice(0, visibleCount);
            const hasMore = filteredTickets.length > visibleCount;
            return (
              <>
                <ListFilters
                  {...filtersHook}
                  searchPlaceholder="Buscar por assunto ou imóvel..."
                  statusOptions={[
                    { value: "novo", label: "Novo" },
                    { value: "em_analise", label: "Em Análise" },
                    { value: "aguardando_info", label: "Aguardando Info" },
                    { value: "em_execucao", label: "Em Execução" },
                    { value: "concluido", label: "Concluído" },
                    { value: "cancelado", label: "Cancelado" },
                  ]}
                  priorityOptions={[
                    { value: "baixa", label: "Baixa" },
                    { value: "normal", label: "Normal" },
                    { value: "alta", label: "Alta" },
                    { value: "urgente", label: "Urgente" },
                  ]}
                  propertyOptions={propertyOptions}
                  showDateRange
                  totalCount={tickets.length}
                  filteredCount={filteredTickets.length}
                />

                {tickets.length === 0 ? (
                  <EmptyState
                    icon={<Ticket className="h-6 w-6" />}
                    title={`Nenhum chamado ${activeTab === "abertos" ? "aberto" : "fechado"}${ticketTypeFilter !== "todos" ? ` em ${typeLabels[ticketTypeFilter]}` : ""}`}
                    description="Crie um novo chamado para registrar uma solicitação ou dúvida."
                    action={
                      <Button onClick={() => navigate("/novo-ticket")} size="sm">
                        <Plus className="h-4 w-4 mr-1" />
                        Criar chamado
                      </Button>
                    }
                  />
                ) : (
                  <div className="space-y-2">
                    {visibleTickets.map((ticket) => {
                      const unreadCount = unreadCounts[ticket.id] || 0;
                      
                return (
                  <div
                    key={ticket.id}
                    className="bg-card border rounded-lg p-3 cursor-pointer transition-all hover:shadow-md hover:border-primary/30 active:scale-[0.99]"
                    onClick={() => navigate(`/ticket-detalhes/${ticket.id}`)}
                  >
                    {/* Row 1: Property + Status + Type + SLA */}
                    <div className="flex items-center gap-2 mb-2">
                      {/* Property thumbnail */}
                      <div className="w-10 h-10 rounded-md overflow-hidden bg-muted shrink-0">
                        {ticket.properties?.cover_photo_url ? (
                          <img 
                            src={ticket.properties.cover_photo_url} 
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Building2 className="h-5 w-5 text-muted-foreground/50" />
                          </div>
                        )}
                      </div>
                      
                      {/* Property name + badges */}
                      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-secondary truncate max-w-[120px]">
                          {ticket.properties?.name || "Sem imóvel"}
                        </span>
                        <Badge className={`text-[10px] h-5 px-1.5 ${getStatusStyle(ticket.status)}`}>
                          {statusLabels[ticket.status]}
                        </Badge>
                        <Badge className={`text-[10px] h-5 px-1.5 ${typeColors[ticket.ticket_type]}`}>
                          {typeLabels[ticket.ticket_type]}
                        </Badge>
                        <TicketBadges ticket={ticket} />
                      </div>

                    </div>

                    {/* Row 2: Subject */}
                    <h3 className="font-semibold text-sm text-foreground mb-1.5 line-clamp-1">
                      {ticket.subject}
                    </h3>

                    {/* Row 3: Last message + Actions */}
                    <div className="flex items-center gap-2">
                      {/* Last message preview */}
                      <div className="flex-1 min-w-0">
                        {ticket.lastMessage ? (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            <MessageSquare className="h-3 w-3 inline mr-1" />
                            {ticket.lastMessage.body}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground/60 italic">
                            Sem mensagens
                          </p>
                        )}
                      </div>

                      {/* Date */}
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {format(new Date(ticket.created_at), "dd/MM", { locale: ptBR })}
                      </span>

                      {/* Chat button */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs shrink-0 border-secondary/30 hover:bg-secondary/10 hover:text-secondary relative"
                        onClick={(e) => openChat(ticket, e)}
                      >
                        <MessageSquare className="h-3.5 w-3.5 mr-1" />
                        Chat
                        {unreadCount > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full h-4 min-w-[16px] flex items-center justify-center px-1">
                            {unreadCount > 9 ? "9+" : unreadCount}
                          </span>
                        )}
                      </Button>

                      {/* Arrow */}
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  </div>
                );
              })}
                  </div>
                )}

                {hasMore && (
                  <div className="flex justify-center pt-2">
                    <Button variant="outline" onClick={() => setVisibleCount((v) => v + 100)}>
                      Carregar mais ({filteredTickets.length - visibleCount} restantes)
                    </Button>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </main>

      {/* Chat Dialog */}
      {selectedTicket && (
        <MaintenanceChatDialog
          open={chatOpen}
          onOpenChange={setChatOpen}
          ticketId={selectedTicket.id}
          ticketSubject={selectedTicket.subject}
          propertyName={selectedTicket.properties?.name}
        />
      )}
    </div>
  );
}
