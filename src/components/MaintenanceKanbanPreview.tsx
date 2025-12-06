import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Wrench, ArrowRight, User, Calendar, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

type MaintenanceTicket = {
  id: string;
  subject: string;
  status: string;
  created_at: string;
  scheduled_at: string | null;
  service_provider_id: string | null;
  property: { name: string } | null;
  service_provider: { id: string; name: string; phone: string | null } | null;
};

type ServiceProvider = {
  id: string;
  name: string;
  phone: string | null;
};

type KanbanColumn = {
  key: string;
  title: string;
  color: string;
  bgColor: string;
};

const columns: KanbanColumn[] = [
  { key: "pendente", title: "Pendente", color: "text-yellow-600", bgColor: "bg-yellow-50 dark:bg-yellow-950/30" },
  { key: "agendado", title: "Agendado", color: "text-blue-600", bgColor: "bg-blue-50 dark:bg-blue-950/30" },
  { key: "em_execucao", title: "Em Execução", color: "text-purple-600", bgColor: "bg-purple-50 dark:bg-purple-950/30" },
  { key: "concluido", title: "Concluído", color: "text-green-600", bgColor: "bg-green-50 dark:bg-green-950/30" },
];

const MAX_ITEMS_PER_COLUMN = 2;

export function MaintenanceKanbanPreview() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [providers, setProviders] = useState<ServiceProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<MaintenanceTicket | null>(null);
  const [saving, setSaving] = useState(false);
  const [scheduleData, setScheduleData] = useState({
    scheduled_at: "",
    service_provider_id: "",
    observation: "",
  });

  useEffect(() => {
    fetchMaintenanceTickets();
    fetchProviders();
  }, []);

  const fetchMaintenanceTickets = async () => {
    try {
      const { data, error } = await supabase
        .from("tickets")
        .select(`
          id,
          subject,
          status,
          created_at,
          scheduled_at,
          service_provider_id,
          property:properties(name),
          service_provider:service_providers(id, name, phone)
        `)
        .eq("ticket_type", "manutencao")
        .neq("status", "cancelado")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setTickets(data || []);
    } catch (error) {
      console.error("Error fetching maintenance tickets:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProviders = async () => {
    try {
      const { data, error } = await supabase
        .from("service_providers")
        .select("id, name, phone")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      setProviders(data || []);
    } catch (error) {
      console.error("Error fetching providers:", error);
    }
  };

  const getTicketsForColumn = (columnKey: string) => {
    if (columnKey === "pendente") {
      return tickets.filter(
        (t) =>
          ["novo", "em_analise", "aguardando_info"].includes(t.status) &&
          !t.scheduled_at
      );
    }
    if (columnKey === "agendado") {
      return tickets.filter(
        (t) =>
          t.scheduled_at &&
          !["em_execucao", "concluido"].includes(t.status)
      );
    }
    if (columnKey === "em_execucao") {
      return tickets.filter((t) => t.status === "em_execucao");
    }
    if (columnKey === "concluido") {
      return tickets.filter((t) => t.status === "concluido");
    }
    return [];
  };

  const openScheduleDialog = (ticket: MaintenanceTicket, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTicket(ticket);
    setScheduleData({
      scheduled_at: ticket.scheduled_at 
        ? format(new Date(ticket.scheduled_at), "yyyy-MM-dd'T'HH:mm")
        : "",
      service_provider_id: ticket.service_provider_id || "",
      observation: "",
    });
    setScheduleDialogOpen(true);
  };

  const handleSchedule = async () => {
    if (!selectedTicket || !user) return;
    
    setSaving(true);
    try {
      // Update ticket with schedule info
      const { error: ticketError } = await supabase
        .from("tickets")
        .update({
          scheduled_at: scheduleData.scheduled_at || null,
          service_provider_id: scheduleData.service_provider_id || null,
        })
        .eq("id", selectedTicket.id);

      if (ticketError) throw ticketError;

      // Create automatic message in ticket
      const provider = providers.find(p => p.id === scheduleData.service_provider_id);
      let messageBody = "📅 **Manutenção agendada**\n\n";
      
      if (scheduleData.scheduled_at) {
        const formattedDate = format(new Date(scheduleData.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
        messageBody += `**Data/Hora:** ${formattedDate}\n`;
      }
      
      if (provider) {
        messageBody += `**Profissional:** ${provider.name}`;
        if (provider.phone) {
          messageBody += ` (${provider.phone})`;
        }
        messageBody += "\n";
      }
      
      if (scheduleData.observation) {
        messageBody += `\n**Observação:** ${scheduleData.observation}`;
      }

      const { error: messageError } = await supabase
        .from("ticket_messages")
        .insert({
          ticket_id: selectedTicket.id,
          author_id: user.id,
          body: messageBody,
          is_internal: false,
        });

      if (messageError) throw messageError;

      toast.success("Manutenção agendada com sucesso!");
      setScheduleDialogOpen(false);
      setSelectedTicket(null);
      fetchMaintenanceTickets();
    } catch (error) {
      console.error("Error scheduling maintenance:", error);
      toast.error("Erro ao agendar manutenção");
    } finally {
      setSaving(false);
    }
  };

  const moveToExecution = async (ticket: MaintenanceTicket, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { error } = await supabase
        .from("tickets")
        .update({ status: "em_execucao" })
        .eq("id", ticket.id);
      if (error) throw error;
      toast.success("Movido para execução!");
      fetchMaintenanceTickets();
    } catch (error) {
      toast.error("Erro ao atualizar");
    }
  };

  const moveToCompleted = async (ticket: MaintenanceTicket, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { error } = await supabase
        .from("tickets")
        .update({ status: "concluido" })
        .eq("id", ticket.id);
      if (error) throw error;
      toast.success("Manutenção concluída!");
      fetchMaintenanceTickets();
    } catch (error) {
      toast.error("Erro ao atualizar");
    }
  };

  const totalPending = tickets.filter(
    (t) =>
      ["novo", "em_analise", "aguardando_info", "em_execucao"].includes(t.status) &&
      t.status !== "concluido"
  ).length;

  if (loading) {
    return (
      <Card className="border-2 border-purple-200 dark:border-purple-800">
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-purple-200 dark:border-purple-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-purple-600" />
            <CardTitle className="text-lg">Quadro de Manutenções</CardTitle>
            {totalPending > 0 && (
              <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                {totalPending} em aberto
              </Badge>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/admin/manutencoes")}
            className="text-purple-600 border-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950"
          >
            Ver quadro completo
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {tickets.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Wrench className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhuma manutenção no momento</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {columns.map((column) => {
              const columnTickets = getTicketsForColumn(column.key);
              const displayTickets = columnTickets.slice(0, MAX_ITEMS_PER_COLUMN);
              const hasMore = columnTickets.length > MAX_ITEMS_PER_COLUMN;

              return (
                <div key={column.key} className={`rounded-lg p-2 ${column.bgColor}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-semibold ${column.color}`}>
                      {column.title}
                    </span>
                    <Badge variant="outline" className="text-xs h-5 px-1.5">
                      {columnTickets.length}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {displayTickets.map((ticket) => (
                      <div
                        key={ticket.id}
                        onClick={() => navigate(`/ticket-detalhes/${ticket.id}`)}
                        className="bg-card rounded p-2 shadow-sm cursor-pointer hover:shadow-md transition-shadow text-xs"
                      >
                        <p className="font-medium line-clamp-1 mb-1">
                          {ticket.property?.name || "Sem unidade"}
                        </p>
                        <p className="text-muted-foreground line-clamp-1 text-[10px]">
                          {ticket.subject}
                        </p>
                        {ticket.scheduled_at && (
                          <div className="flex items-center gap-1 mt-1 text-[10px] text-blue-600">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(ticket.scheduled_at), "dd/MM HH:mm", { locale: ptBR })}
                          </div>
                        )}
                        {ticket.service_provider && (
                          <div className="flex items-center gap-1 mt-1 text-[10px] text-purple-600">
                            <User className="h-3 w-3" />
                            {ticket.service_provider.name}
                          </div>
                        )}
                        
                        {/* Action buttons */}
                        <div className="flex gap-1 mt-2">
                          {column.key === "pendente" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 text-[10px] h-6 px-1"
                              onClick={(e) => openScheduleDialog(ticket, e)}
                            >
                              <Calendar className="h-3 w-3 mr-1" />
                              Agendar
                            </Button>
                          )}
                          {column.key === "agendado" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 text-[10px] h-6 px-1"
                                onClick={(e) => openScheduleDialog(ticket, e)}
                              >
                                Editar
                              </Button>
                              <Button
                                size="sm"
                                className="text-[10px] h-6 px-2"
                                onClick={(e) => moveToExecution(ticket, e)}
                              >
                                <ChevronRight className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                          {column.key === "em_execucao" && (
                            <Button
                              size="sm"
                              className="flex-1 text-[10px] h-6 px-1 bg-green-600 hover:bg-green-700"
                              onClick={(e) => moveToCompleted(ticket, e)}
                            >
                              Concluir
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    {columnTickets.length === 0 && (
                      <p className="text-[10px] text-muted-foreground text-center py-2">
                        Nenhum item
                      </p>
                    )}
                    {hasMore && (
                      <p className="text-[10px] text-center text-muted-foreground">
                        +{columnTickets.length - MAX_ITEMS_PER_COLUMN} mais
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

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
                    {providers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.phone && ` - ${p.phone}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  disabled={saving}
                >
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
