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
  sla_due_at: string | null;
  owner: {
    id: string;
    name: string;
    email: string;
  };
  property: {
    id: string;
    name: string;
    address: string | null;
    cover_photo_url: string | null;
  } | null;
  messages?: {
    count: number;
    last_message?: {
      body: string;
      created_at: string;
      author_name: string;
    };
  };
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
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedTickets, setSelectedTickets] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    if (!user || !['admin', 'agent'].includes(profile?.role || '')) {
      navigate("/");
      return;
    }
    fetchTickets();
  }, [user, profile, navigate]);

  useEffect(() => {
    filterTickets();
  }, [searchTerm, statusFilter, priorityFilter, typeFilter, tickets]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

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
          sla_due_at,
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
              .select('id, name, address, cover_photo_url')
              .eq('id', ticket.property_id)
              .single();
            propertyData = data;
          }

          // Fetch message count and last message
          const { count: messageCount } = await supabase
            .from('ticket_messages')
            .select('*', { count: 'exact', head: true })
            .eq('ticket_id', ticket.id);

          const { data: lastMessageData } = await supabase
            .from('ticket_messages')
            .select(`
              body,
              created_at,
              author:profiles!ticket_messages_author_id_fkey(name)
            `)
            .eq('ticket_id', ticket.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          return {
            ...ticket,
            owner: ownerData || { id: ticket.owner_id, name: 'N/A', email: 'N/A' },
            property: propertyData,
            messages: {
              count: messageCount || 0,
              last_message: lastMessageData ? {
                body: lastMessageData.body,
                created_at: lastMessageData.created_at,
                author_name: (lastMessageData.author as any)?.name || 'N/A'
              } : undefined
            }
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

    if (typeFilter !== 'all') {
      filtered = filtered.filter(ticket => ticket.ticket_type === typeFilter);
    }

    // Sort: open tickets by SLA (closest to expiring first), closed tickets at the end
    filtered.sort((a, b) => {
      const aIsOpen = isTicketOpen(a.status);
      const bIsOpen = isTicketOpen(b.status);
      
      // If one is closed and other is open, open comes first
      if (aIsOpen && !bIsOpen) return -1;
      if (!aIsOpen && bIsOpen) return 1;
      
      // Both open or both closed - sort by SLA
      if (!a.sla_due_at && !b.sla_due_at) return 0;
      if (!a.sla_due_at) return 1;
      if (!b.sla_due_at) return -1;
      return new Date(a.sla_due_at).getTime() - new Date(b.sla_due_at).getTime();
    });

    setFilteredTickets(filtered);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      novo: { label: 'Novo', className: 'bg-blue-500 text-white hover:bg-blue-600' },
      em_analise: { label: 'Em Análise', className: 'bg-yellow-500 text-white hover:bg-yellow-600' },
      em_execucao: { label: 'Em Execução', className: 'bg-orange-500 text-white hover:bg-orange-600' },
      aguardando_info: { label: 'Aguardando Info', className: 'bg-purple-500 text-white hover:bg-purple-600' },
      concluido: { label: 'Concluído', className: 'bg-green-500 text-white hover:bg-green-600' },
      cancelado: { label: 'Cancelado', className: 'bg-red-500 text-white hover:bg-red-600' }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || { label: status, className: 'bg-gray-500 text-white' };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const isTicketOpen = (status: string) => {
    return !['concluido', 'cancelado'].includes(status);
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

  const getTimeUntilSLA = (slaDueAt: string | null) => {
    if (!slaDueAt) return null;
    
    const due = new Date(slaDueAt);
    const diff = due.getTime() - currentTime.getTime();
    
    if (diff < 0) return { text: 'Expirado', isUrgent: true };
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return { 
      text: `${hours}h ${minutes}min`, 
      isUrgent: hours < 3 
    };
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
    // Only admins can delete
    if (profile?.role !== 'admin') {
      toast.error("Apenas administradores podem excluir tickets");
      return;
    }

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

  const handleBulkStatusUpdate = async (newStatus: 'novo' | 'em_analise' | 'em_execucao' | 'aguardando_info' | 'concluido' | 'cancelado') => {
    if (selectedTickets.size === 0) return;

    setUpdatingStatus(true);
    try {
      const { error } = await supabase
        .from('tickets')
        .update({ status: newStatus })
        .in('id', Array.from(selectedTickets));

      if (error) throw error;

      toast.success(`Status de ${selectedTickets.size} ticket(s) atualizado com sucesso`);
      setSelectedTickets(new Set());
      await fetchTickets();
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      toast.error('Erro ao atualizar status dos tickets');
    } finally {
      setUpdatingStatus(false);
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
              <>
                <Select onValueChange={(value) => handleBulkStatusUpdate(value as any)} disabled={updatingStatus}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Alterar Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="novo">Novo</SelectItem>
                    <SelectItem value="em_analise">Em Análise</SelectItem>
                    <SelectItem value="em_execucao">Em Execução</SelectItem>
                    <SelectItem value="aguardando_info">Aguardando Info</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
                {profile?.role === 'admin' && (
                  <Button 
                    onClick={handleDeleteSelected} 
                    variant="destructive"
                    disabled={deleting}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir {selectedTickets.size}
                  </Button>
                )}
              </>
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
            <div className="grid gap-4 md:grid-cols-4">
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
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Tipos</SelectItem>
                  <SelectItem value="manutencao">Manutenção</SelectItem>
                  <SelectItem value="financeiro">Financeiro</SelectItem>
                  <SelectItem value="duvida">Dúvida</SelectItem>
                  <SelectItem value="reclamacao">Reclamação</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
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
            filteredTickets.map((ticket) => {
              const ticketIsOpen = isTicketOpen(ticket.status);
              const slaInfo = ticketIsOpen ? getTimeUntilSLA(ticket.sla_due_at) : null;
              
              return (
                <Card 
                  key={ticket.id} 
                  className="transition-all hover:shadow-lg"
                >
                  <CardContent className="p-6">
                    <div className="flex gap-6">
                      {/* Property Image + Name */}
                      <div 
                        className="cursor-pointer flex flex-col items-center gap-2 min-w-[140px]"
                        onClick={() => navigate(`/ticket-detalhes/${ticket.id}`)}
                      >
                        {ticket.property?.cover_photo_url ? (
                          <img 
                            src={ticket.property.cover_photo_url} 
                            alt={ticket.property.name}
                            className="h-32 w-32 rounded-lg object-cover shadow-md"
                          />
                        ) : (
                          <div className="flex h-32 w-32 items-center justify-center rounded-lg bg-muted">
                            <Building2 className="h-12 w-12 text-muted-foreground" />
                          </div>
                        )}
                        <p className="text-sm font-semibold text-foreground text-center">
                          {ticket.property?.name || 'Sem unidade'}
                        </p>
                      </div>

                      {/* Main Content */}
                      <div 
                        className="flex flex-1 cursor-pointer flex-col gap-3"
                        onClick={() => navigate(`/ticket-detalhes/${ticket.id}`)}
                      >
                        {/* Status and Type */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {getStatusBadge(ticket.status)}
                          <span className="text-muted-foreground">|</span>
                          {getTicketTypeBadge(ticket.ticket_type)}
                        </div>

                        {/* Title */}
                        <h3 className="text-xl font-bold text-foreground">
                          {ticket.subject}
                        </h3>

                        {/* Last Message */}
                        {ticket.messages?.last_message && (
                          <div className="rounded-md bg-muted/30 p-3 border border-border">
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              Última mensagem de {ticket.messages.last_message.author_name}:
                            </p>
                            <p className="text-sm text-foreground line-clamp-2">
                              {ticket.messages.last_message.body}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Right Side Info + Checkbox */}
                      <div className="flex flex-col gap-3 min-w-[200px]">
                        {/* Checkbox */}
                        <div className="flex justify-end">
                          <Checkbox
                            checked={selectedTickets.has(ticket.id)}
                            onCheckedChange={() => toggleTicketSelection(ticket.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>

                        {/* Owner */}
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground mb-1">Proprietário</p>
                          <p className="text-sm font-medium text-foreground">{ticket.owner.name}</p>
                        </div>

                        {/* Created Date */}
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground mb-1">Ticket criado em:</p>
                          <p className="text-sm font-medium text-foreground">
                            {format(new Date(ticket.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </p>
                        </div>

                        {/* SLA Countdown */}
                        {slaInfo && (
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground mb-1">
                              Contagem regressiva pra resposta ({ticket.priority === 'urgente' ? 'urgente' : 'normal'}):
                            </p>
                            <p className={`text-lg font-bold ${slaInfo.isUrgent ? 'text-red-600' : 'text-foreground'}`}>
                              {slaInfo.text}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default TodosTickets;
