import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Search, Phone, Calendar, Clock, Building, User, ChevronRight, Wrench } from "lucide-react";

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

// Kanban columns mapping
const KANBAN_COLUMNS = [
  { 
    id: "pendente", 
    label: "Pendente", 
    statuses: ["novo", "em_analise", "aguardando_info"] as TicketStatus[],
    color: "bg-amber-500/10 border-amber-500/30"
  },
  { 
    id: "agendado", 
    label: "Agendado", 
    statuses: [] as TicketStatus[], // Custom filter: has scheduled_at
    color: "bg-blue-500/10 border-blue-500/30"
  },
  { 
    id: "em_execucao", 
    label: "Em Execução", 
    statuses: ["em_execucao"] as TicketStatus[],
    color: "bg-purple-500/10 border-purple-500/30"
  },
  { 
    id: "concluido", 
    label: "Concluído", 
    statuses: ["concluido"] as TicketStatus[],
    color: "bg-green-500/10 border-green-500/30"
  },
];

const AdminManutencoesKanban = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<MaintenanceTicket | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleData, setScheduleData] = useState({
    scheduled_at: "",
    service_provider_id: "",
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
          property:properties(id, name, cover_photo_url),
          owner:profiles!tickets_owner_id_fkey(id, name),
          service_provider:service_providers(id, name, phone)
        `)
        .eq("ticket_type", "manutencao")
        .neq("status", "cancelado")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as unknown as MaintenanceTicket[];
    },
  });

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
    mutationFn: async (data: { id: string; scheduled_at?: string | null; service_provider_id?: string | null; status?: TicketStatus }) => {
      const { error } = await supabase
        .from("tickets")
        .update(data)
        .eq("id", data.id);
      if (error) throw error;
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

      return { ...col, tickets: columnTickets };
    });
  }, [tickets, search]);

  const openScheduleDialog = (ticket: MaintenanceTicket) => {
    setSelectedTicket(ticket);
    setScheduleData({
      scheduled_at: ticket.scheduled_at 
        ? format(new Date(ticket.scheduled_at), "yyyy-MM-dd'T'HH:mm")
        : "",
      service_provider_id: ticket.service_provider_id || "",
    });
    setScheduleDialogOpen(true);
  };

  const handleSchedule = () => {
    if (!selectedTicket) return;
    
    updateMutation.mutate({
      id: selectedTicket.id,
      scheduled_at: scheduleData.scheduled_at || null,
      service_provider_id: scheduleData.service_provider_id || null,
    });
  };

  const moveToExecution = (ticket: MaintenanceTicket) => {
    updateMutation.mutate({ id: ticket.id, status: "em_execucao" });
  };

  const moveToCompleted = (ticket: MaintenanceTicket) => {
    updateMutation.mutate({ id: ticket.id, status: "concluido" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-2xl font-bold">Quadro de Manutenções</h1>
            <p className="text-muted-foreground text-sm">
              Organize e acompanhe todas as manutenções
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate("/admin/profissionais")}>
            <User className="h-4 w-4 mr-2" />
            Profissionais
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por unidade, proprietário ou profissional..."
            className="pl-10"
          />
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

                <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto">
                  {column.tickets.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhuma manutenção
                    </p>
                  ) : (
                    column.tickets.map((ticket) => (
                      <Card
                        key={ticket.id}
                        className="cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => navigate(`/ticket-detalhes/${ticket.id}`)}
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

                          {/* Subject */}
                          <p className="text-sm line-clamp-2">{ticket.subject}</p>

                          {/* Priority badge */}
                          {ticket.priority === "urgente" && (
                            <Badge variant="destructive" className="text-xs">
                              Urgente
                            </Badge>
                          )}

                          {/* Scheduled info */}
                          {ticket.scheduled_at && (
                            <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
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
                          <div className="flex gap-1 pt-1">
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
                              <Button
                                size="sm"
                                className="flex-1 text-xs h-7 bg-green-600 hover:bg-green-700"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveToCompleted(ticket);
                                }}
                              >
                                Concluir
                              </Button>
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
                    value={scheduleData.service_provider_id}
                    onValueChange={(value) =>
                      setScheduleData((prev) => ({ ...prev, service_provider_id: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um profissional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Nenhum</SelectItem>
                      {providers?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                          {p.phone && ` - ${p.phone}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
      </div>
    </div>
  );
};

export default AdminManutencoesKanban;
