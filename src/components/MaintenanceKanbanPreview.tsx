import { useEffect, useState, useMemo } from "react";
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
import { Wrench, ArrowRight, Calendar, MessageSquare, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useChatPreloader } from "@/hooks/useChatPreloader";
import { MaintenanceChatDialog } from "./MaintenanceChatDialog";

type MaintenanceTicket = {
  id: string;
  subject: string;
  status: string;
  scheduled_at: string | null;
  service_provider_id: string | null;
  cost_responsible: string | null;
  property: { name: string } | null;
  service_provider: { id: string; name: string; phone: string | null } | null;
};

type ServiceProvider = {
  id: string;
  name: string;
  phone: string | null;
};

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
    cost_responsible: "owner" as "owner" | "pm" | "guest",
  });
  const [chatDialogOpen, setChatDialogOpen] = useState(false);
  const [chatTicket, setChatTicket] = useState<MaintenanceTicket | null>(null);

  const ticketIds = useMemo(() => tickets.map(t => t.id), [tickets]);
  const { unreadCounts, markAsRead } = useUnreadMessages(ticketIds);
  useChatPreloader(ticketIds);

  const openChatDialog = (ticket: MaintenanceTicket, e: React.MouseEvent) => {
    e.stopPropagation();
    setChatTicket(ticket);
    setChatDialogOpen(true);
    markAsRead(ticket.id);
  };

  useEffect(() => {
    fetchMaintenanceTickets();
    fetchProviders();
  }, []);

  const fetchMaintenanceTickets = async () => {
    try {
      const { data, error } = await supabase
        .from("tickets")
        .select(`
          id, subject, status, scheduled_at, service_provider_id, cost_responsible,
          property:properties(name),
          service_provider:service_providers(id, name, phone)
        `)
        .eq("ticket_type", "manutencao")
        .neq("status", "cancelado")
        .neq("status", "concluido")
        .order("created_at", { ascending: false })
        .limit(15);

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

  const openScheduleDialog = (ticket: MaintenanceTicket, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTicket(ticket);
    setScheduleData({
      scheduled_at: ticket.scheduled_at ? format(new Date(ticket.scheduled_at), "yyyy-MM-dd'T'HH:mm") : "",
      service_provider_id: ticket.service_provider_id || "",
      observation: "",
      cost_responsible: (ticket.cost_responsible as "owner" | "pm" | "guest") || "owner",
    });
    setScheduleDialogOpen(true);
  };

  const handleSchedule = async () => {
    if (!selectedTicket || !user) return;
    setSaving(true);
    try {
      const { error: ticketError } = await supabase
        .from("tickets")
        .update({
          scheduled_at: scheduleData.scheduled_at || null,
          service_provider_id: scheduleData.service_provider_id || null,
          cost_responsible: scheduleData.cost_responsible,
        })
        .eq("id", selectedTicket.id);

      if (ticketError) throw ticketError;

      const provider = providers.find(p => p.id === scheduleData.service_provider_id);
      let messageBody = "📅 **Manutenção agendada**\n\n";
      if (scheduleData.scheduled_at) {
        messageBody += `**Data/Hora:** ${format(new Date(scheduleData.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}\n`;
      }
      if (provider) {
        messageBody += `**Profissional:** ${provider.name}${provider.phone ? ` (${provider.phone})` : ""}\n`;
      }
      if (scheduleData.observation) {
        messageBody += `\n**Observação:** ${scheduleData.observation}`;
      }

      await supabase.from("ticket_messages").insert({
        ticket_id: selectedTicket.id,
        author_id: user.id,
        body: messageBody,
        is_internal: false,
      });

      toast.success("Manutenção agendada!");
      setScheduleDialogOpen(false);
      setSelectedTicket(null);
      fetchMaintenanceTickets();
    } catch (error) {
      console.error("Error scheduling:", error);
      toast.error("Erro ao agendar");
    } finally {
      setSaving(false);
    }
  };

  const pendentes = tickets.filter(t => ["novo", "em_analise", "aguardando_info"].includes(t.status) && !t.scheduled_at);
  const agendados = tickets.filter(t => t.scheduled_at && t.status !== "em_execucao");

  if (loading) {
    return (
      <Card className="border-purple-200 dark:border-purple-800">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-purple-600 animate-pulse" />
            <div className="h-4 w-36 rounded bg-muted animate-pulse" />
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-purple-200 dark:border-purple-800">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-purple-600" />
            <CardTitle className="text-sm">Manutenções</CardTitle>
            {tickets.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                {tickets.length}
              </Badge>
            )}
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/admin/manutencoes-concluidas")}
              className="h-7 text-xs text-green-600"
            >
              Concluídas
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/admin/manutencoes")}
              className="h-7 text-xs text-purple-600"
            >
              Completo <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0">
        {tickets.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Nenhuma manutenção</p>
        ) : (
          <div className="space-y-3">
            {/* Pendentes */}
            {pendentes.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-yellow-600 mb-1.5">Pendentes ({pendentes.length})</p>
                <div className="space-y-1">
                  {pendentes.slice(0, 5).map((ticket) => (
                    <div
                      key={ticket.id}
                      className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                      onClick={() => navigate(`/ticket-detalhes/${ticket.id}`)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{ticket.property?.name || "Sem unidade"}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{ticket.subject}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 relative"
                        onClick={(e) => openChatDialog(ticket, e)}
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        {unreadCounts[ticket.id] > 0 && (
                          <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-destructive text-[9px] text-white flex items-center justify-center">
                            {unreadCounts[ticket.id]}
                          </span>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={(e) => openScheduleDialog(ticket, e)}
                      >
                        <Calendar className="h-3 w-3 mr-1" />
                        Agendar
                      </Button>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Agendados */}
            {agendados.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-blue-600 mb-1.5">Agendados ({agendados.length})</p>
                <div className="space-y-1">
                  {agendados.slice(0, 5).map((ticket) => (
                    <div
                      key={ticket.id}
                      className="flex items-center gap-2 p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/ticket-detalhes/${ticket.id}`)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{ticket.property?.name || "Sem unidade"}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{ticket.subject}</p>
                      </div>
                      {ticket.scheduled_at && (
                        <span className="text-[10px] font-medium text-blue-600 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(ticket.scheduled_at), "dd/MM HH:mm", { locale: ptBR })}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 relative"
                        onClick={(e) => openChatDialog(ticket, e)}
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        {unreadCounts[ticket.id] > 0 && (
                          <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-destructive text-[9px] text-white flex items-center justify-center">
                            {unreadCounts[ticket.id]}
                          </span>
                        )}
                      </Button>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Schedule Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agendar Manutenção</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Data e Hora</Label>
              <Input
                type="datetime-local"
                value={scheduleData.scheduled_at}
                onChange={(e) => setScheduleData({ ...scheduleData, scheduled_at: e.target.value })}
              />
            </div>
            <div>
              <Label>Profissional</Label>
              <Select
                value={scheduleData.service_provider_id}
                onValueChange={(v) => setScheduleData({ ...scheduleData, service_provider_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Responsável pelo custo</Label>
              <Select
                value={scheduleData.cost_responsible}
                onValueChange={(v) => setScheduleData({ ...scheduleData, cost_responsible: v as "owner" | "pm" | "guest" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Proprietário</SelectItem>
                  <SelectItem value="pm">Gestão</SelectItem>
                  <SelectItem value="guest">Hóspede</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observação (opcional)</Label>
              <Textarea
                value={scheduleData.observation}
                onChange={(e) => setScheduleData({ ...scheduleData, observation: e.target.value })}
                placeholder="Adicione uma observação..."
                rows={2}
              />
            </div>
            <Button onClick={handleSchedule} disabled={saving} className="w-full">
              {saving ? "Salvando..." : "Confirmar Agendamento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <MaintenanceChatDialog
        open={chatDialogOpen}
        onOpenChange={setChatDialogOpen}
        ticketId={chatTicket?.id || null}
        ticketSubject={chatTicket?.subject || ""}
        propertyName={chatTicket?.property?.name || "Sem unidade"}
      />
    </Card>
  );
}
