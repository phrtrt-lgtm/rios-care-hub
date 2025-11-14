import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TicketBadges } from "@/components/TicketBadges";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface OwnerTicket {
  id: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  ticket_type: string;
  created_at: string;
  updated_at: string;
  kind?: string;
  essential?: boolean;
  owner_decision?: string | null;
  owner_action_due_at?: string | null;
  properties: {
    id: string;
    name: string;
  } | null;
}

export default function MeusChamados() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<OwnerTicket[]>([]);
  const [filteredTickets, setFilteredTickets] = useState<OwnerTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  useEffect(() => {
    if (user) {
      fetchTickets();

      const channel = supabase
        .channel("tickets-changes")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "tickets",
            filter: `owner_id=eq.${user.id}`,
          },
          () => {
            fetchTickets();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  useEffect(() => {
    filterTickets();
  }, [tickets, searchTerm, statusFilter, typeFilter]);

  const fetchTickets = async () => {
    try {
      const { data, error } = await supabase
        .from("tickets")
        .select(`
          *,
          properties (id, name)
        `)
        .eq("owner_id", user!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTickets(data || []);
    } catch (error) {
      console.error("Error fetching tickets:", error);
    } finally {
      setLoading(false);
    }
  };

  const filterTickets = () => {
    let filtered = [...tickets];

    if (searchTerm) {
      filtered = filtered.filter(
        (ticket) =>
          ticket.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
          ticket.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((ticket) => ticket.status === statusFilter);
    }

    if (typeFilter !== "all") {
      filtered = filtered.filter((ticket) => ticket.ticket_type === typeFilter);
    }

    setFilteredTickets(filtered);
  };

  const getStatusLabel = (status: string) => {
    const statusMap: { [key: string]: string } = {
      novo: "Novo",
      em_analise: "Em Análise",
      aguardando_info: "Aguardando Info",
      em_execucao: "Em Execução",
      concluido: "Concluído",
      cancelado: "Cancelado",
    };
    return statusMap[status] || status;
  };

  const getTypeLabel = (type: string) => {
    const typeMap: { [key: string]: string } = {
      duvida: "Dúvida",
      manutencao: "Manutenção",
      cobranca: "Cobrança",
      bloqueio_data: "Bloqueio de Data",
      financeiro: "Financeiro",
      outros: "Outros",
      informacao: "Informação",
      conversar_hospedes: "Conversar com Hóspedes",
      melhorias_compras: "Melhorias/Compras",
    };
    return typeMap[type] || type;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/minha-caixa")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-semibold">Meus Chamados</h1>
              <p className="text-sm text-muted-foreground">
                {filteredTickets.length} {filteredTickets.length === 1 ? "chamado" : "chamados"}
              </p>
            </div>
            <Button onClick={() => navigate("/novo-ticket")}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Chamado
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="mb-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por assunto ou descrição..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="novo">Novo</SelectItem>
                <SelectItem value="em_analise">Em Análise</SelectItem>
                <SelectItem value="aguardando_info">Aguardando Info</SelectItem>
                <SelectItem value="em_execucao">Em Execução</SelectItem>
                <SelectItem value="concluido">Concluído</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="duvida">Dúvida</SelectItem>
                <SelectItem value="manutencao">Manutenção</SelectItem>
                <SelectItem value="cobranca">Cobrança</SelectItem>
                <SelectItem value="bloqueio_data">Bloqueio de Data</SelectItem>
                <SelectItem value="financeiro">Financeiro</SelectItem>
                <SelectItem value="outros">Outros</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Carregando chamados...</p>
          </div>
        ) : filteredTickets.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                {searchTerm || statusFilter !== "all" || typeFilter !== "all"
                  ? "Nenhum chamado encontrado com os filtros aplicados"
                  : "Você ainda não tem chamados"}
              </p>
              <Button onClick={() => navigate("/novo-ticket")}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeiro Chamado
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredTickets.map((ticket) => (
              <Card
                key={ticket.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/ticket-detalhes/${ticket.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-1">
                      <CardTitle className="text-lg">{ticket.subject}</CardTitle>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {ticket.description}
                      </p>
                      {ticket.properties && (
                        <p className="text-sm text-muted-foreground">
                          📍 {ticket.properties.name}
                        </p>
                      )}
                    </div>
                    <TicketBadges ticket={ticket} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Criado{" "}
                      {formatDistanceToNow(new Date(ticket.created_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </span>
                    <span>
                      Atualizado{" "}
                      {formatDistanceToNow(new Date(ticket.updated_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
