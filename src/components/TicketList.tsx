import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const statusLabels: Record<string, string> = {
  novo: "Novo",
  em_analise: "Em Análise",
  aguardando_info: "Aguardando Info",
  em_execucao: "Em Execução",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

const typeLabels: Record<string, string> = {
  duvida: "Dúvida",
  manutencao: "Manutenção",
  cobranca: "Cobrança",
  bloqueio_data: "Bloqueio de Data",
  financeiro: "Financeiro",
  outros: "Outros",
};

export const TicketList = () => {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("abertos");
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      fetchTickets();
    }
  }, [user, activeTab]);

  const fetchTickets = async () => {
    setLoading(true);
    let query = supabase
      .from("tickets")
      .select("*, properties(name)")
      .eq("owner_id", user?.id)
      .order("created_at", { ascending: false });

    if (activeTab === "abertos") {
      query = query.in("status", ["novo", "em_analise", "aguardando_info", "em_execucao"]);
    } else {
      query = query.in("status", ["concluido", "cancelado"]);
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
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList className="mb-6">
        <TabsTrigger value="abertos">Abertos</TabsTrigger>
        <TabsTrigger value="fechados">Fechados</TabsTrigger>
      </TabsList>

      <TabsContent value={activeTab}>
        {tickets.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground">
                Nenhum ticket {activeTab === "abertos" ? "aberto" : "fechado"} encontrado
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {tickets.map((ticket) => (
              <Card
                key={ticket.id}
                className="cursor-pointer transition-all hover:shadow-lg"
                onClick={() => navigate(`/tickets/${ticket.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{ticket.subject}</CardTitle>
                      <div className="flex gap-2">
                        <Badge variant="outline" className="text-xs">
                          {typeLabels[ticket.ticket_type]}
                        </Badge>
                        <Badge variant={getPriorityColor(ticket.priority)} className="text-xs">
                          {ticket.priority === "urgente" ? "Urgente" : "Normal"}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge className={`${getStatusColor(ticket.status)} text-white`}>
                        {statusLabels[ticket.status]}
                      </Badge>
                      {ticket.sla_due_at && !ticket.first_response_at && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(ticket.sla_due_at), {
                            locale: ptBR,
                            addSuffix: true,
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {ticket.description}
                  </p>
                  {ticket.properties && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Propriedade: {ticket.properties.name}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Criado {formatDistanceToNow(new Date(ticket.created_at), {
                      locale: ptBR,
                      addSuffix: true,
                    })}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
};