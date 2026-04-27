import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useLocation } from "react-router-dom";
import { goBack, saveScrollPosition } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Search, Phone, Calendar, Clock, Building, User, ChevronRight, ChevronLeft, Wrench, Plus, Receipt, AlertCircle, MessageSquare, Package, BarChart3 } from "lucide-react";
import { CHARGE_CATEGORY_OPTIONS } from "@/constants/chargeCategories";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MaintenanceChatDialog } from "@/components/MaintenanceChatDialog";
import { CompleteMaintenanceDialog } from "@/components/CompleteMaintenanceDialog";

type TicketStatus = "novo" | "em_analise" | "aguardando_info" | "em_execucao" | "concluido" | "cancelado";

interface MaintenanceTicket {
  id: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: string;
  created_at: string;
  scheduled_at: string | null;
  service_provider_id: string | null;
  cost_responsible: "owner" | "pm" | "guest" | null;
  property: {
    id: string;
    name: string;
    cover_photo_url: string | null;
  } | null;
  owner: {
    id: string;
    name: string;
  } | null;
  service_provider: {
    id: string;
    name: string;
    phone: string | null;
  } | null;
}

interface ServiceProvider {
  id: string;
  name: string;
  phone: string | null;
  specialty: string[] | null;
}

// Kanban columns mapping (without Concluído - has dedicated page)
const KANBAN_COLUMNS = [
  { 
    id: "pendente", 
    label: "Pendente", 
    statuses: ["novo", "em_analise", "aguardando_info"] as TicketStatus[],
    color: "bg-warning/10 border-warning/30/30"
  },
  { 
    id: "agendado", 
    label: "Agendado", 
    statuses: [] as TicketStatus[], // Custom filter: has scheduled_at
    color: "bg-info/10 border-info/30/30"
  },
  { 
    id: "em_execucao", 
    label: "Em Execução", 
    statuses: ["em_execucao"] as TicketStatus[],
    color: "bg-primary/10 border-primary/30/30"
  },
];

const AdminManutencoesKanban = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("manutencoes");
  const [search, setSearch] = useState("");
  const [responsibleFilter, setResponsibleFilter] = useState<"all" | "owner" | "pm" | "guest">("all");
  const [selectedTicket, setSelectedTicket] = useState<MaintenanceTicket | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [scheduleData, setScheduleData] = useState({
    scheduled_at: "",
    service_provider_id: "",
    observation: "",
    cost_responsible: "owner" as "owner" | "pm" | "guest",
  });
  const [chatDialogOpen, setChatDialogOpen] = useState(false);
  const [chatTicket, setChatTicket] = useState<MaintenanceTicket | null>(null);

  // Fetch pending debits count
  const { data: pendingDebitsCount } = useQuery({
    queryKey: ["pending-reserve-debits-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("charges")
        .select("*", { count: "exact", head: true })
        .eq("status", "aguardando_reserva")
        .not("reserve_debit_date", "is", null);

      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch maintenance tickets
  const { data: tickets, isLoading } = useQuery({
    queryKey: ["maintenance-tickets-kanban"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(`
          id,
          subject,
          description,
          status,
          priority,
          created_at,
          scheduled_at,
          service_provider_id,
          cost_responsible,
          property:properties(id, name, cover_photo_url),
          owner:profiles!tickets_owner_id_fkey(id, name),
          service_provider:service_providers(id, name, phone)
        `)
        .eq("ticket_type", "manutencao")
        .neq("status", "cancelado")
        .neq("status", "concluido")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as unknown as MaintenanceTicket[];
    },
  });

  // Get ticket IDs for unread message tracking
  const ticketIds = useMemo(() => (tickets || []).map(t => t.id), [tickets]);
  const { unreadCounts, markAsRead } = useUnreadMessages(ticketIds);

  const openChatDialog = (ticket: MaintenanceTicket, e: React.MouseEvent) => {
    e.stopPropagation();
    setChatTicket(ticket);
    setChatDialogOpen(true);
    // Mark as read when opening
    markAsRead(ticket.id);
  };

  // Fetch service providers
  const { data: providers } = useQuery({
    queryKey: ["service-providers-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_providers")
        .select("id, name, phone, specialty")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as ServiceProvider[];
    },
  });

  // Update ticket mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { 
      id: string; 
      scheduled_at?: string | null; 
      service_provider_id?: string | null; 
      status?: TicketStatus;
      observation?: string;
      cost_responsible?: "owner" | "pm" | "guest";
    }) => {
      const { observation, ...updateData } = data;
      
      // Update ticket
      const { error } = await supabase
        .from("tickets")
        .update(updateData)
        .eq("id", data.id);
      if (error) throw error;

      // If scheduling with observation, create ticket message
      if ((data.scheduled_at || data.service_provider_id) && user) {
        const provider = providers?.find(p => p.id === data.service_provider_id);
        let messageBody = "📅 **Manutenção agendada**\n\n";
        
        if (data.scheduled_at) {
          const formattedDate = format(new Date(data.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
          messageBody += `**Data/Hora:** ${formattedDate}\n`;
        }
        
        if (provider) {
          messageBody += `**Profissional:** ${provider.name}`;
          if (provider.phone) {
            messageBody += ` (${provider.phone})`;
          }
          messageBody += "\n";
        }
        
        if (observation) {
          messageBody += `\n**Observação:** ${observation}`;
        }

      await supabase
        .from("ticket_messages")
        .insert({
          ticket_id: data.id,
          author_id: user.id,
          body: messageBody,
          is_internal: false,
        });

      // Notify owner if cost_responsible is 'owner' (not guest/pm which are hidden from owner)
      const ticket = tickets?.find(t => t.id === data.id);
      if (ticket && (updateData.cost_responsible === 'owner' || (!updateData.cost_responsible && ticket.cost_responsible === 'owner'))) {
        const formattedDate = data.scheduled_at 
          ? format(new Date(data.scheduled_at), "dd/MM 'às' HH:mm", { locale: ptBR })
          : "";
        await supabase.from("notifications").insert({
          owner_id: ticket.owner?.id,
          title: "Manutenção Agendada",
          message: `${ticket.property?.name || "Sua unidade"} - ${formattedDate}`,
          type: "maintenance",
          reference_id: data.id,
          reference_url: `/manutencao/${data.id}`,
        });
      }
    }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance-tickets-kanban"] });
      toast.success("Manutenção atualizada!");
      setScheduleDialogOpen(false);
      setSelectedTicket(null);
    },
    onError: () => {
      toast.error("Erro ao atualizar manutenção");
    },
  });

  // Organize tickets into columns
  const columns = useMemo(() => {
    if (!tickets) return KANBAN_COLUMNS.map((col) => ({ ...col, tickets: [] }));

    return KANBAN_COLUMNS.map((col) => {
      let columnTickets: MaintenanceTicket[] = [];

      if (col.id === "agendado") {
        // Agendado: has scheduled_at but not em_execucao or concluido
        columnTickets = tickets.filter(
          (t) => 
            t.scheduled_at && 
            !["em_execucao", "concluido"].includes(t.status)
        );
      } else if (col.id === "pendente") {
        // Pendente: matching statuses AND no scheduled_at
        columnTickets = tickets.filter(
          (t) => 
            col.statuses.includes(t.status) && 
            !t.scheduled_at
        );
      } else {
        // Other columns: just match status
        columnTickets = tickets.filter((t) => col.statuses.includes(t.status));
      }

      // Apply search filter
      if (search) {
        const searchLower = search.toLowerCase();
        columnTickets = columnTickets.filter(
          (t) =>
            t.subject.toLowerCase().includes(searchLower) ||
            t.property?.name.toLowerCase().includes(searchLower) ||
            t.owner?.name.toLowerCase().includes(searchLower) ||
            t.service_provider?.name.toLowerCase().includes(searchLower)
        );
      }

      // Apply responsible filter
      if (responsibleFilter !== "all") {
        columnTickets = columnTickets.filter(
          (t) => (t.cost_responsible || "owner") === responsibleFilter
        );
      }

      return { ...col, tickets: columnTickets };
    });
  }, [tickets, search, responsibleFilter]);

  const openScheduleDialog = (ticket: MaintenanceTicket) => {
    setSelectedTicket(ticket);
    setScheduleData({
      scheduled_at: ticket.scheduled_at 
        ? format(new Date(ticket.scheduled_at), "yyyy-MM-dd'T'HH:mm")
        : "",
      service_provider_id: ticket.service_provider_id || "",
      observation: "",
      cost_responsible: ticket.cost_responsible || "owner",
    });
    setScheduleDialogOpen(true);
  };

  const handleSchedule = () => {
    if (!selectedTicket) return;
    
    updateMutation.mutate({
      id: selectedTicket.id,
      scheduled_at: scheduleData.scheduled_at || null,
      service_provider_id: scheduleData.service_provider_id || null,
      observation: scheduleData.observation,
      cost_responsible: scheduleData.cost_responsible,
    });
  };

  const moveToExecution = (ticket: MaintenanceTicket) => {
    updateMutation.mutate({ id: ticket.id, status: "em_execucao" });
  };

  const openCompleteDialog = (ticket: MaintenanceTicket) => {
    setSelectedTicket(ticket);
    setCompleteDialogOpen(true);
  };

  const moveBackToScheduled = (ticket: MaintenanceTicket) => {
    updateMutation.mutate({ id: ticket.id, status: "em_analise" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => goBack(navigate, "/painel")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-2xl font-bold">Quadro de Manutenções</h1>
            <p className="text-muted-foreground text-sm">
              Organize e acompanhe todas as manutenções
            </p>
          </div>
          <Button onClick={() => navigate("/admin/nova-manutencao")}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Manutenção
          </Button>
          <Button variant="outline" onClick={() => navigate("/nova-cobranca?reposicao=true")}>
            <Package className="h-4 w-4 mr-2" />
            Reposição de Item
          </Button>
          <Button variant="outline" onClick={() => navigate("/admin/manutencoes-lista")}>
            Ver Lista
          </Button>
          <Button variant="secondary" onClick={() => navigate("/admin/manutencoes-concluidas")}>
            Concluídas
          </Button>
          <Button variant="outline" onClick={() => navigate("/admin/profissionais")}>
            <User className="h-4 w-4 mr-2" />
            Profissionais
          </Button>
          <Button variant="outline" onClick={() => navigate("/admin/relatorio-cobrancas")}>
            <BarChart3 className="h-4 w-4 mr-2" />
            Cobranças Pagas
          </Button>
          <Button variant="outline" onClick={() => navigate("/manutencoes")}>
            <BarChart3 className="h-4 w-4 mr-2" />
            Relatório
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por unidade, proprietário ou profissional..."
              className="pl-10"
            />
          </div>
          <Select value={responsibleFilter} onValueChange={(v: any) => setResponsibleFilter(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Responsável" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="owner">Proprietário</SelectItem>
              <SelectItem value="pm">Gestão</SelectItem>
              <SelectItem value="guest">Hóspede</SelectItem>
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
                  <div className="h-24 bg-muted rounded" />
                  <div className="h-24 bg-muted rounded" />
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

                <div className="space-y-3 max-h-[calc(100vh-350px)] overflow-y-auto">
                  {column.tickets.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhuma manutenção
                    </p>
                  ) : (
                    column.tickets.map((ticket) => (
                      <Card
                        key={ticket.id}
                        className="cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => (saveScrollPosition(pathname), navigate(`/ticket-detalhes/${ticket.id}`))}
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

                          <p className="text-sm line-clamp-2">{ticket.subject}</p>

                          {/* Cost responsible badge */}
                          <div className="flex flex-wrap gap-1">
                            {ticket.cost_responsible === "guest" && (
                              <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/30/30">
                                Hóspede
                              </Badge>
                            )}
                            {ticket.cost_responsible === "pm" && (
                              <Badge variant="outline" className="text-xs bg-info/10 text-info border-info/30/30">
                                Gestão
                              </Badge>
                            )}
                            {ticket.priority === "urgente" && (
                              <Badge variant="destructive" className="text-xs">
                                Urgente
                              </Badge>
                            )}
                          </div>

                          {/* Scheduled info */}
                          {ticket.scheduled_at && (
                            <div className="flex items-center gap-1 text-xs text-info">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(ticket.scheduled_at), "dd/MM HH:mm", { locale: ptBR })}
                            </div>
                          )}

                          {/* Provider info */}
                          {ticket.service_provider && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Wrench className="h-3 w-3" />
                              <span className="truncate">{ticket.service_provider.name}</span>
                              {ticket.service_provider.phone && (
                                <a
                                  href={`tel:${ticket.service_provider.phone}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-primary hover:underline"
                                >
                                  <Phone className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          )}

                          {/* Created date */}
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(ticket.created_at), {
                              addSuffix: true,
                              locale: ptBR,
                            })}
                          </div>

                          {/* Action buttons */}
                          <div className="flex flex-wrap gap-1 pt-1">
                            {/* Chat button - always visible */}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs h-7 px-2 relative"
                              onClick={(e) => openChatDialog(ticket, e)}
                              title="Mensagens"
                            >
                              <MessageSquare className="h-3 w-3" />
                              {unreadCounts[ticket.id] > 0 && (
                                <span className="absolute -top-1 -right-1 bg-destructive text-white text-[8px] rounded-full h-4 min-w-[16px] flex items-center justify-center px-1 font-bold">
                                  {unreadCounts[ticket.id] > 9 ? "9+" : unreadCounts[ticket.id]}
                                </span>
                              )}
                            </Button>
                            {column.id === "pendente" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 text-xs h-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openScheduleDialog(ticket);
                                }}
                              >
                                <Calendar className="h-3 w-3 mr-1" />
                                Agendar
                              </Button>
                            )}
                            {column.id === "agendado" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1 text-xs h-7"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openScheduleDialog(ticket);
                                  }}
                                >
                                  Editar
                                </Button>
                                <Button
                                  size="sm"
                                  className="flex-1 text-xs h-7"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveToExecution(ticket);
                                  }}
                                >
                                  <ChevronRight className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                            {column.id === "em_execucao" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-7"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveBackToScheduled(ticket);
                                  }}
                                  title="Voltar para agendado"
                                >
                                  <ChevronLeft className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  className="flex-1 text-xs h-7 bg-success hover:bg-success"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openCompleteDialog(ticket);
                                  }}
                                >
                                  <Receipt className="h-3 w-3 mr-1" />
                                  Concluir
                                </Button>
                              </>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}


        {/* Schedule Dialog */}
        <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Agendar Manutenção</DialogTitle>
            </DialogHeader>
            {selectedTicket && (
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="font-medium">{selectedTicket.subject}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedTicket.property?.name}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="scheduled_at">Data e Horário</Label>
                  <Input
                    id="scheduled_at"
                    type="datetime-local"
                    value={scheduleData.scheduled_at}
                    onChange={(e) =>
                      setScheduleData((prev) => ({ ...prev, scheduled_at: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="provider">Profissional</Label>
                  <Select
                    value={scheduleData.service_provider_id || "none"}
                    onValueChange={(value) =>
                      setScheduleData((prev) => ({ ...prev, service_provider_id: value === "none" ? "" : value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um profissional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {providers?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                          {p.phone && ` - ${p.phone}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Responsável pelo custo</Label>
                  <Select
                    value={scheduleData.cost_responsible}
                    onValueChange={(value: "owner" | "pm" | "guest") =>
                      setScheduleData((prev) => ({ ...prev, cost_responsible: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">Proprietário</SelectItem>
                      <SelectItem value="pm">Gestão</SelectItem>
                      <SelectItem value="guest">Hóspede (invisível pro proprietário)</SelectItem>
                    </SelectContent>
                  </Select>
                  {scheduleData.cost_responsible === "guest" && (
                    <p className="text-xs text-warning">
                      ⚠️ Manutenções de hóspede não aparecem para o proprietário
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="observation">Observação (opcional)</Label>
                  <Textarea
                    id="observation"
                    placeholder="Adicione informações relevantes sobre a visita..."
                    value={scheduleData.observation}
                    onChange={(e) =>
                      setScheduleData((prev) => ({ ...prev, observation: e.target.value }))
                    }
                    rows={3}
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setScheduleDialogOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleSchedule}
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Complete Maintenance Dialog */}
        <CompleteMaintenanceDialog
          open={completeDialogOpen}
          onOpenChange={setCompleteDialogOpen}
          ticket={selectedTicket ? {
            id: selectedTicket.id,
            subject: selectedTicket.subject,
            cost_responsible: selectedTicket.cost_responsible,
            owner: selectedTicket.owner,
            property: selectedTicket.property,
          } : null}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["maintenance-tickets-kanban"] });
            setSelectedTicket(null);
          }}
        />

        {/* Chat Dialog */}
        <MaintenanceChatDialog
          open={chatDialogOpen}
          onOpenChange={setChatDialogOpen}
          ticketId={chatTicket?.id || null}
          ticketSubject={chatTicket?.subject}
          propertyName={chatTicket?.property?.name}
        />
      </div>
    </div>
  );
};

export default AdminManutencoesKanban;
