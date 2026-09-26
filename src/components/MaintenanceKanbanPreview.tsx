import { useEffect, useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { saveScrollPosition } from "@/lib/navigation";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Wrench, ArrowRight, Calendar, MessageSquare, ChevronDown, ChevronUp, CheckCircle } from "lucide-react";
import { QuickAttachmentButton } from "./QuickAttachmentButton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useChatPreloader } from "@/hooks/useChatPreloader";
import { MaintenanceChatDialog } from "./MaintenanceChatDialog";
import {
  BotaoLinha,
  CaixaCarregando,
  CaixaOperacao,
  CaixaVazia,
  GrupoCaixa,
  LinhaCaixa,
  SeloContagem,
} from "@/components/painel/CaixaOperacao";

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
  const { pathname } = useLocation();
  const { user, profile } = useAuth();
  // /admin/manutencoes e /admin/manutencoes-concluidas são só admin/maintenance;
  // agent vê a caixa, mas o link o devolveria ao início.
  const podeAbrirQuadro = profile?.role === "admin" || profile?.role === "maintenance";
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [completeTicket, setCompleteTicket] = useState<MaintenanceTicket | null>(null);
  const [completeData, setCompleteData] = useState({
    title: "",
    amountCents: "",
    managementContributionCents: "",
    createCharge: true,
  });
  const [completing, setCompleting] = useState(false);
  
  const COLLAPSED_LIMIT = 3;
  // Expandido mostra tudo; a lista rola dentro da caixa.
  const EXPANDED_LIMIT = Number.POSITIVE_INFINITY;

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
        .is("archived_at", null)
        // Sem teto: antes era .limit(15), e o "15" do cabeçalho era o limite da
        // consulta, não o total — as manutenções abertas mais antigas sumiam.
        .order("created_at", { ascending: false });

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

  const openCompleteDialog = (ticket: MaintenanceTicket, e: React.MouseEvent) => {
    e.stopPropagation();
    setCompleteTicket(ticket);
    setCompleteData({ title: ticket.subject, amountCents: "", managementContributionCents: "0", createCharge: true });
    setCompleteDialogOpen(true);
  };

  const handleComplete = async () => {
    if (!completeTicket || !user) return;
    setCompleting(true);
    try {
      const { error: ticketError } = await supabase
        .from("tickets")
        .update({ status: "concluido" })
        .eq("id", completeTicket.id);
      if (ticketError) throw ticketError;

      if (completeData.createCharge && completeData.amountCents) {
        const amountCents = Math.round(parseFloat(completeData.amountCents.replace(",", ".")) * 100);
        const mgmtCents = Math.round(parseFloat((completeData.managementContributionCents || "0").replace(",", ".")) * 100);

        // Get owner_id from ticket
        const { data: ticketData } = await supabase
          .from("tickets")
          .select("owner_id, property_id, cost_responsible")
          .eq("id", completeTicket.id)
          .single();

        if (ticketData) {
          await supabase.from("charges").insert({
            owner_id: ticketData.owner_id,
            property_id: ticketData.property_id,
            ticket_id: completeTicket.id,
            title: completeData.title,
            amount_cents: amountCents,
            management_contribution_cents: mgmtCents,
            status: "sent",
            cost_responsible: ticketData.cost_responsible || "owner",
          });
        }
      }

      toast.success("Manutenção concluída!" + (completeData.createCharge && completeData.amountCents ? " Cobrança criada." : ""));
      setCompleteDialogOpen(false);
      fetchMaintenanceTickets();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao concluir manutenção");
    } finally {
      setCompleting(false);
    }
  };

  const pendentes = tickets.filter(t => ["novo", "em_analise", "aguardando_info"].includes(t.status) && !t.scheduled_at);
  const agendados = tickets.filter(t => t.scheduled_at && t.status !== "em_execucao");
  const hasMoreItems = pendentes.length > COLLAPSED_LIMIT || agendados.length > COLLAPSED_LIMIT;

  const renderRow = (ticket: MaintenanceTicket, agendado: boolean) => (
    <LinhaCaixa
      key={ticket.id}
      titulo={ticket.property?.name || "Sem unidade"}
      subtitulo={ticket.subject}
      tom={agendado ? "info" : "neutral"}
      tingida={agendado}
      onClick={() => (saveScrollPosition(pathname), navigate(`/ticket-detalhes/${ticket.id}`))}
      meta={
        agendado && ticket.scheduled_at ? (
          <span className="hidden items-center gap-1 whitespace-nowrap text-[11px] font-medium text-info sm:inline-flex">
            <Calendar className="h-3 w-3" aria-hidden="true" />
            {format(new Date(ticket.scheduled_at), "dd/MM HH:mm", { locale: ptBR })}
          </span>
        ) : undefined
      }
      acoes={
        <>
          <QuickAttachmentButton ticketId={ticket.id} onSuccess={fetchMaintenanceTickets} />
          <BotaoLinha
            rotulo="Abrir conversa da manutenção"
            naoLidas={unreadCounts[ticket.id] || 0}
            onClick={(e) => openChatDialog(ticket, e)}
          >
            <MessageSquare />
          </BotaoLinha>
          {!agendado && (
            <BotaoLinha rotulo="Agendar manutenção" onClick={(e) => openScheduleDialog(ticket, e)}>
              <Calendar />
            </BotaoLinha>
          )}
          <BotaoLinha rotulo="Concluir e cobrar" tom="success" onClick={(e) => openCompleteDialog(ticket, e)}>
            <CheckCircle />
          </BotaoLinha>
        </>
      }
    />
  );

  if (loading) {
    return <CaixaCarregando icone={<Wrench />} titulo="Manutenções" tom="primary" />;
  }

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <CaixaOperacao
        icone={<Wrench />}
        titulo="Manutenções"
        tom="primary"
        selos={tickets.length > 0 && <SeloContagem tom="primary">{tickets.length}</SeloContagem>}
        acoes={
          <>
            {hasMoreItems && (
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {isExpanded ? "Recolher" : "Expandir"}
                </Button>
              </CollapsibleTrigger>
            )}
            {podeAbrirQuadro && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/admin/manutencoes-concluidas")}
                  className="h-7 px-2 text-xs text-success hover:text-success"
                >
                  <span className="hidden sm:inline">Concluídas</span>
                  <span className="sm:hidden">OK</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/admin/manutencoes")}
                  className="h-7 gap-1 px-2 text-xs text-primary hover:text-primary"
                >
                  <span className="hidden sm:inline">Quadro completo</span>
                  <span className="sm:hidden">Ver</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </>
        }
      >
        {tickets.length === 0 ? (
          <CaixaVazia icone={<Wrench className="h-5 w-5" />} titulo="Nenhuma manutenção aberta" />
        ) : (
          <div className="space-y-3">
            {/* Pendentes */}
            {pendentes.length > 0 && (
              <GrupoCaixa titulo="Pendentes" quantidade={pendentes.length} tom="warning">
                {pendentes.slice(0, COLLAPSED_LIMIT).map((t) => renderRow(t, false))}
                {/* Itens expandidos de pendentes */}
                <CollapsibleContent className="max-h-72 space-y-1 overflow-y-auto pr-1">
                  {pendentes.slice(COLLAPSED_LIMIT, EXPANDED_LIMIT).map((t) => renderRow(t, false))}
                </CollapsibleContent>
              </GrupoCaixa>
            )}

            {/* Agendados */}
            {agendados.length > 0 && (
              <GrupoCaixa titulo="Agendados" quantidade={agendados.length} tom="info">
                {agendados.slice(0, COLLAPSED_LIMIT).map((t) => renderRow(t, true))}
                {/* Itens expandidos de agendados */}
                <CollapsibleContent className="max-h-72 space-y-1 overflow-y-auto pr-1">
                  {agendados.slice(COLLAPSED_LIMIT, EXPANDED_LIMIT).map((t) => renderRow(t, true))}
                </CollapsibleContent>
              </GrupoCaixa>
            )}
          </div>
        )}

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

      {/* Complete & Charge Dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Concluir e Cobrar</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Título da cobrança</Label>
              <Input
                value={completeData.title}
                onChange={(e) => setCompleteData({ ...completeData, title: e.target.value })}
                placeholder="Ex: Reparo elétrico"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="createCharge"
                checked={completeData.createCharge}
                onChange={(e) => setCompleteData({ ...completeData, createCharge: e.target.checked })}
                className="h-4 w-4"
              />
              <Label htmlFor="createCharge" className="cursor-pointer">Criar cobrança para o proprietário</Label>
            </div>
            {completeData.createCharge && (
              <>
                <div>
                  <Label>Valor total (R$)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={completeData.amountCents}
                    onChange={(e) => setCompleteData({ ...completeData, amountCents: e.target.value })}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <Label>Aporte da gestão (R$)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={completeData.managementContributionCents}
                    onChange={(e) => setCompleteData({ ...completeData, managementContributionCents: e.target.value })}
                    placeholder="0,00"
                  />
                  {completeData.amountCents && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Proprietário pagará: R$ {(
                        parseFloat(completeData.amountCents || "0") - parseFloat(completeData.managementContributionCents || "0")
                      ).toFixed(2).replace(".", ",")}
                    </p>
                  )}
                </div>
              </>
            )}
            <Button
              onClick={handleComplete}
              disabled={completing}
              className="w-full"
              variant="success"
            >
              {completing ? "Salvando..." : completeData.createCharge && completeData.amountCents ? "Concluir e Criar Cobrança" : "Concluir"}
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
        onTicketUpdated={fetchMaintenanceTickets}
      />
      </CaixaOperacao>
    </Collapsible>
  );
}
