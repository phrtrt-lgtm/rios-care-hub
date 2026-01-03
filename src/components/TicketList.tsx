import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LoadingScreen } from "@/components/LoadingScreen";
import { TicketBadges } from "@/components/TicketBadges";

const statusLabels: Record<string, string> = {
  novo: "Novo",
  em_analise: "Em Análise",
  aguardando_info: "Aguardando Info",
  em_execucao: "Em Execução",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

const typeLabels: Record<string, string> = {
  duvida: "Dúvida/Informação",
  conversar_hospedes: "Conversar com Hóspedes",
  bloqueio_data: "Bloqueio de Datas",
  manutencao: "Manutenção",
  melhorias_compras: "Melhorias/Compras",
  cobranca: "Cobrança",
  financeiro: "Financeiro",
  outros: "Outros",
};

export const TicketList = () => {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("abertos");
  const [ticketTypeFilter, setTicketTypeFilter] = useState("todos");
  const [currentTime, setCurrentTime] = useState(new Date());
  const { user } = useAuth();
  const navigate = useNavigate();

  // Update current time every minute for live countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

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
      // Hide maintenance tickets where guest is responsible (internal only)
      .or("cost_responsible.is.null,cost_responsible.neq.guest");

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
      // Fetch last message for each ticket
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

      // Sort: open tickets by SLA (closest to expiring first), closed tickets at the end
      ticketsWithMessages.sort((a, b) => {
        const aIsOpen = ["novo", "em_analise", "aguardando_info", "em_execucao"].includes(a.status);
        const bIsOpen = ["novo", "em_analise", "aguardando_info", "em_execucao"].includes(b.status);
        
        // If one is closed and other is open, open comes first
        if (aIsOpen && !bIsOpen) return -1;
        if (!aIsOpen && bIsOpen) return 1;
        
        // Both open or both closed - sort by SLA
        if (!a.sla_due_at && !b.sla_due_at) return 0;
        if (!a.sla_due_at) return 1;
        if (!b.sla_due_at) return -1;
        return new Date(a.sla_due_at).getTime() - new Date(b.sla_due_at).getTime();
      });

      setTickets(ticketsWithMessages);
    }
    setLoading(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "novo":
        return "bg-blue-500";
      case "em_analise":
        return "bg-yellow-500";
      case "aguardando_info":
        return "bg-orange-500";
      case "em_execucao":
        return "bg-purple-500";
      case "concluido":
        return "bg-green-500";
      case "cancelado":
        return "bg-gray-500";
      default:
        return "bg-gray-500";
    }
  };

  const getPriorityColor = (priority: string) => {
    return priority === "urgente" ? "destructive" : "secondary";
  };

  const getTimeUntilSLA = (slaDueAt: string | null) => {
    if (!slaDueAt) return null;
    
    const now = currentTime.getTime();
    const slaTime = new Date(slaDueAt).getTime();
    const diffMs = slaTime - now;
    
    if (diffMs < 0) {
      return { expired: true, text: "SLA Expirado", hours: 0, minutes: 0 };
    }
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    return {
      expired: false,
      text: `${hours}h ${minutes}m`,
      hours,
      minutes,
      isUrgent: hours < 2
    };
  };

  if (loading) {
    return <LoadingScreen message="Carregando tickets..." />;
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="abertos">Abertos</TabsTrigger>
          <TabsTrigger value="fechados">Fechados</TabsTrigger>
        </TabsList>
      </Tabs>

      <Tabs value={ticketTypeFilter} onValueChange={setTicketTypeFilter}>
        <TabsList className="mb-6 flex-wrap h-auto">
          <TabsTrigger value="todos">Todos</TabsTrigger>
          <TabsTrigger value="manutencao">Manutenção</TabsTrigger>
          <TabsTrigger value="bloqueio_data">Bloqueio de Datas</TabsTrigger>
          <TabsTrigger value="duvida">Dúvida/Info</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="outros">Outros</TabsTrigger>
        </TabsList>
      </Tabs>

      {tickets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">
              Nenhum ticket {activeTab === "abertos" ? "aberto" : "fechado"} encontrado
              {ticketTypeFilter !== "todos" && ` na categoria ${typeLabels[ticketTypeFilter]}`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {tickets.map((ticket) => {
            const ticketIsOpen = ["novo", "em_analise", "aguardando_info", "em_execucao"].includes(ticket.status);
            const slaInfo = ticketIsOpen ? getTimeUntilSLA(ticket.sla_due_at) : null;
            
            return (
              <Card
                key={ticket.id}
                className="cursor-pointer hover-lift hover:border-primary/20 overflow-hidden group animate-fade-in"
                onClick={() => navigate(`/ticket-detalhes/${ticket.id}`)}
                style={{ animationDelay: `${tickets.indexOf(ticket) * 50}ms` }}
              >
                <div className="flex gap-4 p-4">
                  {/* Left side - Property Photo and Info */}
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-32 h-32 flex-shrink-0 relative rounded-lg overflow-hidden bg-muted">
                      {ticket.properties?.cover_photo_url ? (
                        <img 
                          src={ticket.properties.cover_photo_url} 
                          alt={ticket.properties.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary/20 to-secondary/5">
                          <Building2 className="h-12 w-12 text-muted-foreground/40" />
                        </div>
                      )}
                    </div>
                    {ticket.properties && (
                      <p className="text-xs text-center font-medium text-muted-foreground line-clamp-2 w-32">
                        {ticket.properties.name}
                      </p>
                    )}
                  </div>

                  {/* Center - Main Content */}
                  <div className="flex-1 min-w-0 space-y-3">
                    {/* Top badges */}
                    <div className="flex flex-wrap gap-2 items-center">
                      <Badge className={`${getStatusColor(ticket.status)} text-white`}>
                        {statusLabels[ticket.status]}
                      </Badge>
                      <Badge variant="outline" className="bg-background">
                        {typeLabels[ticket.ticket_type]}
                      </Badge>
                      <Badge variant={getPriorityColor(ticket.priority)}>
                        {ticket.priority === "urgente" ? "Urgente" : "Normal"}
                      </Badge>
                      <TicketBadges ticket={ticket} />
                    </div>

                    {/* Subject */}
                    <h3 className="font-bold text-lg leading-tight group-hover:text-primary transition-colors">
                      {ticket.subject}
                    </h3>

                    {/* Last Message */}
                    {ticket.lastMessage && (
                      <div className="bg-muted/50 rounded-md p-3 border border-border/50">
                        <div className="flex items-start gap-2 mb-1">
                          <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                          <span className="text-xs text-muted-foreground">
                            Última mensagem {formatDistanceToNow(new Date(ticket.lastMessage.created_at), {
                              locale: ptBR,
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                        <p className="text-sm line-clamp-2 pl-6">
                          {ticket.lastMessage.body}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Right side - Metadata */}
                  <div className="flex flex-col items-end justify-between gap-2 min-w-[140px]">
                    <div className="text-right space-y-1">
                      <p className="text-xs text-muted-foreground">
                        Criado em
                      </p>
                      <p className="text-sm font-medium">
                        {format(new Date(ticket.created_at), "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(ticket.created_at), "HH:mm", { locale: ptBR })}
                      </p>
                    </div>

                    {/* SLA Countdown */}
                    {slaInfo && (
                      <div className={`text-right px-3 py-2 rounded-md ${
                        slaInfo.expired 
                          ? "bg-destructive/10 border border-destructive" 
                          : slaInfo.isUrgent
                          ? "bg-orange-500/10 border border-orange-500"
                          : "bg-primary/10 border border-primary/20"
                      }`}>
                        <p className="text-xs text-muted-foreground mb-0.5">
                          {slaInfo.expired ? "SLA" : "Expira em"}
                        </p>
                        <p className={`text-lg font-bold ${
                          slaInfo.expired 
                            ? "text-destructive" 
                            : slaInfo.isUrgent
                            ? "text-orange-600"
                            : "text-primary"
                        }`}>
                          {slaInfo.expired ? "EXPIRADO" : slaInfo.text}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};