import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Search, Filter, Building2, User, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Ticket {
  id: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  ticket_type: string;
  created_at: string;
  owner: {
    id: string;
    name: string;
    email: string;
  };
  property: {
    id: string;
    name: string;
    address: string | null;
  } | null;
}

const TodosTickets = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filteredTickets, setFilteredTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [selectedTickets, setSelectedTickets] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user || !['admin', 'agent'].includes(profile?.role || '')) {
      navigate("/");
      return;
    }
    fetchTickets();
  }, [user, profile, navigate]);

  useEffect(() => {
    filterTickets();
  }, [searchTerm, statusFilter, priorityFilter, tickets]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      
      const { data: ticketsData, error } = await supabase
        .from('tickets')
        .select(`
          id,
          subject,
          description,
          status,
          priority,
          ticket_type,
          created_at,
          owner_id,
          property_id
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch owner and property details for each ticket
      const ticketsWithDetails = await Promise.all(
        (ticketsData || []).map(async (ticket) => {
          const { data: ownerData } = await supabase
            .from('profiles')
            .select('id, name, email')
            .eq('id', ticket.owner_id)
            .single();

          let propertyData = null;
          if (ticket.property_id) {
            const { data } = await supabase
              .from('properties')
              .select('id, name, address')
              .eq('id', ticket.property_id)
              .single();
            propertyData = data;
          }

          return {
            ...ticket,
            owner: ownerData || { id: ticket.owner_id, name: 'N/A', email: 'N/A' },
            property: propertyData
          };
        })
      );

      setTickets(ticketsWithDetails);
    } catch (error) {
      console.error('Erro ao carregar tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterTickets = () => {
    let filtered = [...tickets];

    if (searchTerm) {
      filtered = filtered.filter(ticket => 
        ticket.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.owner.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (ticket.property?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(ticket => ticket.status === statusFilter);
    }

    if (priorityFilter !== 'all') {
      filtered = filtered.filter(ticket => ticket.priority === priorityFilter);
    }

    setFilteredTickets(filtered);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      novo: { label: 'Novo', variant: 'default' as const },
      em_andamento: { label: 'Em Andamento', variant: 'secondary' as const },
      aguardando_resposta: { label: 'Aguardando', variant: 'outline' as const },
      concluido: { label: 'Concluído', variant: 'default' as const },
      cancelado: { label: 'Cancelado', variant: 'destructive' as const }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || { label: status, variant: 'outline' as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const priorityConfig = {
      baixa: { label: 'Baixa', variant: 'outline' as const },
      normal: { label: 'Normal', variant: 'secondary' as const },
      alta: { label: 'Alta', variant: 'default' as const },
      urgente: { label: 'Urgente', variant: 'destructive' as const }
    };

    const config = priorityConfig[priority as keyof typeof priorityConfig] || { label: priority, variant: 'outline' as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getTicketTypeBadge = (type: string) => {
    const typeConfig = {
      manutencao: { label: 'Manutenção', variant: 'default' as const },
      financeiro: { label: 'Financeiro', variant: 'secondary' as const },
      duvida: { label: 'Dúvida', variant: 'outline' as const },
      reclamacao: { label: 'Reclamação', variant: 'destructive' as const },
      outro: { label: 'Outro', variant: 'outline' as const }
    };

    const config = typeConfig[type as keyof typeof typeConfig] || { label: type, variant: 'outline' as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const toggleTicketSelection = (ticketId: string) => {
    const newSelected = new Set(selectedTickets);
    if (newSelected.has(ticketId)) {
      newSelected.delete(ticketId);
    } else {
      newSelected.add(ticketId);
    }
    setSelectedTickets(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedTickets.size === filteredTickets.length) {
      setSelectedTickets(new Set());
    } else {
      setSelectedTickets(new Set(filteredTickets.map(t => t.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedTickets.size === 0) return;

    if (!confirm(`Tem certeza que deseja excluir ${selectedTickets.size} ticket(s)?`)) {
      return;
    }

    setDeleting(true);
    try {
      const { error } = await supabase
        .from('tickets')
        .delete()
        .in('id', Array.from(selectedTickets));

      if (error) throw error;

      toast.success(`${selectedTickets.size} ticket(s) excluído(s) com sucesso`);
      setSelectedTickets(new Set());
      await fetchTickets();
    } catch (error) {
      console.error('Erro ao excluir tickets:', error);
      toast.error('Erro ao excluir tickets');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/painel")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-foreground">Todos os Tickets</h1>
            <p className="text-muted-foreground">Visualização completa de todos os tickets do sistema</p>
          </div>
          <div className="flex gap-2">
            {selectedTickets.size > 0 && (
              <Button 
                onClick={handleDeleteSelected} 
                variant="destructive"
                disabled={deleting}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir {selectedTickets.size}
              </Button>
            )}
            <Button onClick={() => navigate("/propriedades")} variant="outline">
              <Building2 className="mr-2 h-4 w-4" />
              Gerenciar Unidades
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por assunto, proprietário ou unidade..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  <SelectItem value="novo">Novo</SelectItem>
                  <SelectItem value="em_andamento">Em Andamento</SelectItem>
                  <SelectItem value="aguardando_resposta">Aguardando Resposta</SelectItem>
                  <SelectItem value="concluido">Concluído</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Prioridade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Prioridades</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Lista de Tickets */}
        <div className="space-y-4">
          {filteredTickets.length > 0 && (
            <div className="flex items-center gap-2 px-2">
              <Checkbox
                checked={selectedTickets.size === filteredTickets.length}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-sm text-muted-foreground">
                Selecionar todos ({filteredTickets.length})
              </span>
            </div>
          )}
          {filteredTickets.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">Nenhum ticket encontrado com os filtros aplicados.</p>
              </CardContent>
            </Card>
          ) : (
            filteredTickets.map((ticket) => (
              <Card 
                key={ticket.id} 
                className="transition-all hover:shadow-md"
              >
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <Checkbox
                      checked={selectedTickets.has(ticket.id)}
                      onCheckedChange={() => toggleTicketSelection(ticket.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div 
                      className="flex flex-1 cursor-pointer items-start justify-between"
                      onClick={() => navigate(`/ticket-detalhes/${ticket.id}`)}
                    >
                    <div className="flex-1">
                      <CardTitle className="mb-2">{ticket.subject}</CardTitle>
                      <CardDescription className="line-clamp-2">
                        {ticket.description}
                      </CardDescription>
                    </div>
                    <div className="flex flex-col gap-2">
                      {getStatusBadge(ticket.status)}
                      {getPriorityBadge(ticket.priority)}
                      {getTicketTypeBadge(ticket.ticket_type)}
                    </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{ticket.owner.name}</p>
                        <p className="text-xs text-muted-foreground">{ticket.owner.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {ticket.property?.name || 'Sem unidade'}
                        </p>
                        {ticket.property?.address && (
                          <p className="text-xs text-muted-foreground">{ticket.property.address}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">
                        Criado em {format(new Date(ticket.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default TodosTickets;
