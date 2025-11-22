import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Clock, Building2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
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
  informacao: "Informação",
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
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      fetchTickets();
    }
  }, [user, activeTab, ticketTypeFilter]);

  const fetchTickets = async () => {
    setLoading(true);
    let query = supabase
      .from("tickets")
      .select("*, properties(name, cover_photo_url), kind, essential, owner_decision, owner_action_due_at")
      .eq("owner_id", user?.id)
      .order("created_at", { ascending: false });

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
      setTickets(data);
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
          {tickets.map((ticket) => (
            <Card
              key={ticket.id}
              className="cursor-pointer transition-all hover:shadow-md hover:border-primary/20 overflow-hidden group"
              onClick={() => navigate(`/ticket-detalhes/${ticket.id}`)}
            >
              <div className="flex">
                {/* Thumbnail da Propriedade */}
                <div className="w-24 md:w-32 flex-shrink-0 relative">
                  <AspectRatio ratio={16 / 9} className="bg-muted rounded overflow-hidden">
                    {ticket.properties?.cover_photo_url ? (
                      <img 
                        src={ticket.properties.cover_photo_url} 
                        alt={ticket.properties.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary/20 to-secondary/5">
                        <Building2 className="h-8 w-8 text-muted-foreground/40" />
                      </div>
                    )}
                  </AspectRatio>
                  {/* Status Badge sobreposto */}
                  <div className="absolute top-2 left-2">
                    <Badge className={`${getStatusColor(ticket.status)} text-white text-xs shadow-lg`}>
                      {statusLabels[ticket.status]}
                    </Badge>
                  </div>
                </div>

                {/* Conteúdo */}
                <div className="flex-1 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      {/* Título */}
                      <h3 className="font-semibold text-base leading-tight line-clamp-1 group-hover:text-primary transition-colors">
                        {ticket.subject}
                      </h3>
                      
                      {/* Badges */}
                      <div className="flex flex-wrap gap-1.5">
                        <TicketBadges ticket={ticket} />
                        <Badge variant="outline" className="text-xs bg-background">
                          {typeLabels[ticket.ticket_type]}
                        </Badge>
                        <Badge variant={getPriorityColor(ticket.priority)} className="text-xs">
                          {ticket.priority === "urgente" ? "Urgente" : "Normal"}
                        </Badge>
                      </div>

                      {/* Descrição */}
                      <p className="line-clamp-2 text-sm text-muted-foreground leading-relaxed">
                        {ticket.description}
                      </p>

                      {/* Info Footer */}
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
                        {ticket.properties && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {ticket.properties.name}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Criado {formatDistanceToNow(new Date(ticket.created_at), {
                            locale: ptBR,
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                    </div>

                    {/* SLA Indicator */}
                    {ticket.sla_due_at && !ticket.first_response_at && (
                      <div className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded-md">
                        <Clock className="h-3 w-3" />
                        <span className="hidden md:inline">
                          {formatDistanceToNow(new Date(ticket.sla_due_at), {
                            locale: ptBR,
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};