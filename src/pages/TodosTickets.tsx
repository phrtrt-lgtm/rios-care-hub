import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Building2, Trash2, MessageSquare, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MaintenanceChatDialog } from "@/components/MaintenanceChatDialog";
import { ListFilters } from "@/components/list/ListFilters";
import { useListFilters } from "@/hooks/useListFilters";

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
  const filtersHook = useListFilters("filters:todos-tickets");
  const { filters, debouncedSearch, applyTo } = filtersHook;
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedTickets, setSelectedTickets] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedTicketForChat, setSelectedTicketForChat] = useState<Ticket | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<string>("recent");
  const [visibleCount, setVisibleCount] = useState(100);

  useEffect(() => {
    if (!user || !['admin', 'agent'].includes(profile?.role || '')) {
      navigate("/");
      return;
    }
    fetchTickets();
  }, [user, profile, navigate]);

  useEffect(() => {
    filterTickets();
  }, [debouncedSearch, filters.status, filters.priority, filters.property, filters.dateFrom, filters.dateTo, typeFilter, sortBy, tickets]);

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
    let filtered = applyTo(tickets, {
      searchFields: (t) => [t.subject, t.description, t.owner.name, t.property?.name],
      status: (t) => t.status,
      priority: (t) => t.priority,
      propertyId: (t) => t.property?.id ?? null,
      date: (t) => t.created_at,
    });

    if (typeFilter !== 'all') {
      filtered = filtered.filter(ticket => ticket.ticket_type === typeFilter);
    }

    // Group: open tickets first, closed at the end. Within each group, apply selected sort.
    filtered.sort((a, b) => {
      const aIsOpen = isTicketOpen(a.status);
      const bIsOpen = isTicketOpen(b.status);

      if (aIsOpen && !bIsOpen) return -1;
      if (!aIsOpen && bIsOpen) return 1;

      if (sortBy === "oldest") {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }

      if (sortBy === "sla") {
        if (!a.sla_due_at && !b.sla_due_at) return 0;
        if (!a.sla_due_at) return 1;
        if (!b.sla_due_at) return -1;
        return new Date(a.sla_due_at).getTime() - new Date(b.sla_due_at).getTime();
      }

      // default: recent (most recent first)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    setFilteredTickets(filtered);
    setVisibleCount(100);
  };

  // Build property options from loaded tickets
  const propertyOptions = (() => {
    const map = new Map<string, string>();
    tickets.forEach((t) => {
      if (t.property?.id) map.set(t.property.id, t.property.name);
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  })();

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      novo: { label: 'Novo', className: 'bg-info text-white hover:bg-info' },
      em_analise: { label: 'Em Análise', className: 'bg-warning text-white hover:bg-warning' },
      em_execucao: { label: 'Em Execução', className: 'bg-warning text-white hover:bg-warning' },
      aguardando_info: { label: 'Aguardando Info', className: 'bg-primary text-white hover:bg-primary' },
      concluido: { label: 'Concluído', className: 'bg-success text-white hover:bg-success' },
      cancelado: { label: 'Cancelado', className: 'bg-destructive text-white hover:bg-destructive' }
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

  const openChat = (ticket: Ticket) => {
    setSelectedTicketForChat(ticket);
    setChatOpen(true);
  };

  const toggleRowExpand = (ticketId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(ticketId)) {
        next.delete(ticketId);
      } else {
        next.add(ticketId);
      }
      return next;
    });
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
          <CardContent className="pt-6">
            <ListFilters
              {...filtersHook}
              searchPlaceholder="Buscar por assunto, proprietário ou unidade..."
              statusOptions={[
                { value: "novo", label: "Novo" },
                { value: "em_analise", label: "Em Análise" },
                { value: "em_execucao", label: "Em Execução" },
                { value: "aguardando_info", label: "Aguardando Info" },
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
              extra={
                <>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      <SelectItem value="all">Todos os tipos</SelectItem>
                      <SelectItem value="manutencao">Manutenção</SelectItem>
                      <SelectItem value="financeiro">Financeiro</SelectItem>
                      <SelectItem value="duvida">Dúvida</SelectItem>
                      <SelectItem value="reclamacao">Reclamação</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger>
                      <SelectValue placeholder="Ordenar por" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      <SelectItem value="recent">Mais recentes</SelectItem>
                      <SelectItem value="oldest">Mais antigos</SelectItem>
                      <SelectItem value="sla">SLA (vencendo antes)</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              }
            />
          </CardContent>
        </Card>

        {/* Tickets Abertos */}
        {(() => {
          const visibleTickets = filteredTickets.slice(0, visibleCount);
          const openTickets = visibleTickets.filter(t => isTicketOpen(t.status));
          const closedTickets = visibleTickets.filter(t => !isTicketOpen(t.status));
          const hasMore = filteredTickets.length > visibleCount;
          
          const renderTicketRow = (ticket: Ticket) => {
            const ticketIsOpen = isTicketOpen(ticket.status);
            const slaInfo = ticketIsOpen ? getTimeUntilSLA(ticket.sla_due_at) : null;
            const isExpanded = expandedRows.has(ticket.id);
            
            return (
              <>
                <TableRow 
                  key={ticket.id}
                  className="group hover:bg-muted/50 cursor-pointer"
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedTickets.has(ticket.id)}
                      onCheckedChange={() => toggleTicketSelection(ticket.id)}
                    />
                  </TableCell>
                  <TableCell onClick={() => toggleRowExpand(ticket.id)}>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell onClick={() => toggleRowExpand(ticket.id)}>
                    <div className="flex items-center gap-2">
                      {ticket.property?.cover_photo_url ? (
                        <img 
                          src={ticket.property.cover_photo_url} 
                          alt={ticket.property.name}
                          className="h-8 w-8 rounded object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded bg-muted">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <span className="font-medium text-sm truncate max-w-[100px]">
                        {ticket.property?.name || 'Sem unidade'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell onClick={() => toggleRowExpand(ticket.id)}>
                    {getStatusBadge(ticket.status)}
                  </TableCell>
                  <TableCell onClick={() => toggleRowExpand(ticket.id)}>
                    {getTicketTypeBadge(ticket.ticket_type)}
                  </TableCell>
                  <TableCell onClick={() => toggleRowExpand(ticket.id)}>
                    <span className="font-medium text-sm line-clamp-1">
                      {ticket.subject}
                    </span>
                  </TableCell>
                  <TableCell onClick={() => toggleRowExpand(ticket.id)}>
                    <span className="text-sm text-muted-foreground truncate max-w-[100px] block">
                      {ticket.owner.name}
                    </span>
                  </TableCell>
                  <TableCell onClick={() => toggleRowExpand(ticket.id)}>
                    {slaInfo ? (
                      <span className={`text-sm font-semibold ${slaInfo.isUrgent ? 'text-destructive' : 'text-foreground'}`}>
                        {slaInfo.text}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell onClick={() => toggleRowExpand(ticket.id)}>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(ticket.created_at), "dd/MM", { locale: ptBR })}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          openChat(ticket);
                        }}
                        title="Abrir chat"
                      >
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/ticket-detalhes/${ticket.id}`);
                        }}
                        title="Ver detalhes"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                {/* Expanded row with last message */}
                {isExpanded && (
                  <TableRow key={`${ticket.id}-expanded`} className="bg-muted/20">
                    <TableCell colSpan={10} className="py-3 px-4">
                      <div className="flex flex-col gap-2">
                        {ticket.messages?.last_message ? (
                          <div className="rounded-md bg-background p-3 border border-border">
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              Última mensagem de {ticket.messages.last_message.author_name} • {format(new Date(ticket.messages.last_message.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}:
                            </p>
                            <p className="text-sm text-foreground">
                              {ticket.messages.last_message.body}
                            </p>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">Nenhuma mensagem ainda</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>Total de mensagens: {ticket.messages?.count || 0}</span>
                          <span>Criado: {format(new Date(ticket.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                          {ticket.property?.address && (
                            <span>Endereço: {ticket.property.address}</span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            );
          };

          return (
            <div className="space-y-6">
              {/* Seção Tickets Abertos */}
              <Card>
                <CardHeader className="py-3 px-4 bg-info/10 border-b">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-info" />
                    Tickets Abertos
                    <Badge variant="secondary" className="ml-2">{openTickets.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {openTickets.length === 0 ? (
                    <div className="py-8 text-center">
                      <p className="text-muted-foreground text-sm">Nenhum ticket aberto</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="w-[40px]">
                              <Checkbox
                                checked={openTickets.every(t => selectedTickets.has(t.id)) && openTickets.length > 0}
                                onCheckedChange={() => {
                                  const allSelected = openTickets.every(t => selectedTickets.has(t.id));
                                  const newSelected = new Set(selectedTickets);
                                  openTickets.forEach(t => {
                                    if (allSelected) {
                                      newSelected.delete(t.id);
                                    } else {
                                      newSelected.add(t.id);
                                    }
                                  });
                                  setSelectedTickets(newSelected);
                                }}
                              />
                            </TableHead>
                            <TableHead className="w-[40px]"></TableHead>
                            <TableHead className="min-w-[150px]">Unidade</TableHead>
                            <TableHead className="min-w-[100px]">Status</TableHead>
                            <TableHead className="min-w-[100px]">Tipo</TableHead>
                            <TableHead className="min-w-[200px]">Assunto</TableHead>
                            <TableHead className="min-w-[120px]">Proprietário</TableHead>
                            <TableHead className="min-w-[80px]">SLA</TableHead>
                            <TableHead className="min-w-[100px]">Criado em</TableHead>
                            <TableHead className="w-[100px] text-right">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {openTickets.map(renderTicketRow)}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Seção Tickets Concluídos */}
              <Card>
                <CardHeader className="py-3 px-4 bg-success/10 border-b">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-success" />
                    Tickets Concluídos / Cancelados
                    <Badge variant="secondary" className="ml-2">{closedTickets.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {closedTickets.length === 0 ? (
                    <div className="py-8 text-center">
                      <p className="text-muted-foreground text-sm">Nenhum ticket concluído</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="w-[40px]">
                              <Checkbox
                                checked={closedTickets.every(t => selectedTickets.has(t.id)) && closedTickets.length > 0}
                                onCheckedChange={() => {
                                  const allSelected = closedTickets.every(t => selectedTickets.has(t.id));
                                  const newSelected = new Set(selectedTickets);
                                  closedTickets.forEach(t => {
                                    if (allSelected) {
                                      newSelected.delete(t.id);
                                    } else {
                                      newSelected.add(t.id);
                                    }
                                  });
                                  setSelectedTickets(newSelected);
                                }}
                              />
                            </TableHead>
                            <TableHead className="w-[40px]"></TableHead>
                            <TableHead className="min-w-[150px]">Unidade</TableHead>
                            <TableHead className="min-w-[100px]">Status</TableHead>
                            <TableHead className="min-w-[100px]">Tipo</TableHead>
                            <TableHead className="min-w-[200px]">Assunto</TableHead>
                            <TableHead className="min-w-[120px]">Proprietário</TableHead>
                            <TableHead className="min-w-[80px]">SLA</TableHead>
                            <TableHead className="min-w-[100px]">Criado em</TableHead>
                            <TableHead className="w-[100px] text-right">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {closedTickets.map(renderTicketRow)}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {hasMore && (
                <div className="flex justify-center pt-2">
                  <Button variant="outline" onClick={() => setVisibleCount((v) => v + 100)}>
                    Carregar mais ({filteredTickets.length - visibleCount} restantes)
                  </Button>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Chat Dialog */}
      <MaintenanceChatDialog
        open={chatOpen}
        onOpenChange={setChatOpen}
        ticketId={selectedTicketForChat?.id || null}
        ticketSubject={selectedTicketForChat?.subject}
        propertyName={selectedTicketForChat?.property?.name}
      />
    </div>
  );
};

export default TodosTickets;
