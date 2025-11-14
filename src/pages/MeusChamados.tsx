import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Building2, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TicketBadges } from "@/components/TicketBadges";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LoadingScreen } from "@/components/LoadingScreen";

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

export default function MeusChamados() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("abertos");
  const [ticketTypeFilter, setTicketTypeFilter] = useState("todos");

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
    return <LoadingScreen message="Carregando chamados..." />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/minha-caixa")}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-semibold">Meus Chamados</h1>
                <p className="text-sm text-muted-foreground">
                  {tickets.length} {tickets.length === 1 ? "chamado" : "chamados"}
                </p>
              </div>
            </div>
            <Button onClick={() => navigate("/novo-ticket")}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Chamado
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
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
                <p className="text-muted-foreground mb-4">
                  Nenhum ticket {activeTab === "abertos" ? "aberto" : "fechado"} encontrado
                  {ticketTypeFilter !== "todos" && ` na categoria ${typeLabels[ticketTypeFilter]}`}
                </p>
                <Button onClick={() => navigate("/novo-ticket")}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Primeiro Chamado
                </Button>
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
                    <div className="relative w-24 md:w-32 flex-shrink-0 bg-muted">
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
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
