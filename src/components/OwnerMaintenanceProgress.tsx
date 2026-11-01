import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CaixaCarregando, CaixaOperacao, SeloContagem } from "@/components/painel/CaixaOperacao";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate, useLocation } from "react-router-dom";
import { saveScrollPosition } from "@/lib/navigation";
import { Wrench, Calendar, Building2, MessageCircle, ChevronRight, ShoppingCart, Users } from "lucide-react";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useChatPreloader } from "@/hooks/useChatPreloader";
import { MaintenanceDetailsDialog } from "@/components/MaintenanceDetailsDialog";
import { MaintenanceChatDialog } from "@/components/MaintenanceChatDialog";
import { EtapasManutencao, etapaManutencao } from "@/components/maintenance/ResumoManutencao";
import { toast } from "sonner";
import { ownerScopeFilter } from "@/lib/ownerScope";

interface MaintenanceTicket {
  id: string;
  subject: string;
  status: string;
  created_at: string;
  scheduled_at: string | null;
  kind?: string | null;
  essential?: boolean | null;
  owner_decision?: string | null;
  owner_action_due_at?: string | null;
  cost_responsible?: string | null;
  /** "compra" = a RIOS compra e cobra (imóvel novo); o resto é manutenção. */
  natureza?: string | null;
  property: {
    id: string;
    name: string;
    cover_photo_url: string | null;
  } | null;
}

export function OwnerMaintenanceProgress() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  // A linha abre o popup de acompanhamento; o balão abre direto a conversa.
  const [selectedTicket, setSelectedTicket] = useState<MaintenanceTicket | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTicket, setChatTicket] = useState<MaintenanceTicket | null>(null);
  const [decidingTicketId, setDecidingTicketId] = useState<string | null>(null);

  const { data: maintenances, isLoading, refetch } = useQuery({
    queryKey: ["owner-maintenances", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("tickets")
        .select(`
          id,
          subject,
          status,
          created_at,
          scheduled_at,
          cost_responsible,
          kind,
          essential,
          owner_decision,
          owner_action_due_at,
          natureza,
          property:properties(id, name, cover_photo_url)
        `)
        .or(await ownerScopeFilter(user.id))
        .eq("ticket_type", "manutencao")
        .or("cost_responsible.is.null,cost_responsible.neq.guest")
        .in("status", ["novo", "em_analise", "aguardando_info", "em_execucao"])
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as unknown as MaintenanceTicket[];
    },
    enabled: !!user,
  });

  const ticketIds = maintenances?.map((t) => t.id) || [];
  const { unreadCounts, markAsRead } = useUnreadMessages(ticketIds);
  useChatPreloader(ticketIds);

  const handleOpenChat = (ticket: MaintenanceTicket, e: React.MouseEvent) => {
    e.stopPropagation();
    setChatTicket(ticket);
    markAsRead(ticket.id);
  };

  const handleDecision = async (ticketId: string, decision: 'owner_will_fix' | 'pm_will_fix', e: React.MouseEvent) => {
    e.stopPropagation();
    setDecidingTicketId(ticketId);
    
    try {
      const newStatus = decision === 'pm_will_fix' ? 'em_execucao' : 'aguardando_info';
      
      const { error } = await supabase
        .from('tickets')
        .update({
          owner_decision: decision,
          status: newStatus as any
        })
        .eq('id', ticketId);

      if (error) throw error;

      // Notify team about the decision
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      fetch(`${supabaseUrl}/functions/v1/notify-owner-decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
        },
        body: JSON.stringify({
          type: 'decision_made',
          ticketId,
          decision,
        }),
      }).catch(err => console.error('Failed to notify team:', err));

      toast.success(decision === 'owner_will_fix' 
        ? 'Você assumiu a execução da manutenção' 
        : 'Manutenção delegada à gestão!'
      );
      
      refetch();
    } catch (error) {
      console.error('Error updating decision:', error);
      toast.error('Erro ao registrar decisão');
    } finally {
      setDecidingTicketId(null);
    }
  };

  // Check if ticket needs owner decision (só quando a equipe marcou o proprietário como responsável)
  const needsDecision = (ticket: MaintenanceTicket) => {
    return (
      !ticket.essential &&
      !ticket.owner_decision &&
      !!ticket.owner_action_due_at &&
      ticket.cost_responsible === 'owner'
    );
  };

  if (isLoading) {
    return <CaixaCarregando icone={<Wrench />} titulo="Manutenções em andamento" tom="primary" linhas={2} />;
  }

  if (!maintenances || maintenances.length === 0) {
    return null;
  }

  return (
    <>
      <CaixaOperacao
        icone={<Wrench />}
        titulo="Manutenções em andamento"
        tom="primary"
        selos={<SeloContagem tom="primary">{maintenances.length}</SeloContagem>}
      >
          <div className="max-h-[480px] space-y-4 overflow-y-auto pr-1">
            {maintenances.map((ticket) => {
              const currentStep = etapaManutencao(ticket.status, ticket.scheduled_at);
              const unreadCount = unreadCounts[ticket.id] || 0;
              const showDecisionButtons = needsDecision(ticket);
              const isDeciding = decidingTicketId === ticket.id;
              const dueDate = ticket.owner_action_due_at ? new Date(ticket.owner_action_due_at) : null;
              const isOverdue = dueDate && dueDate < new Date();

              return (
                <div
                  key={ticket.id}
                  className="group cursor-pointer rounded-lg bg-muted/40 p-4 transition-colors hover:bg-muted/70"
                  onClick={() => { setSelectedTicket(ticket); setChatOpen(true); markAsRead(ticket.id); }}
                >
                  <div className="flex items-start gap-3 mb-4">
                    {/* Property photo */}
                    <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-background">
                      {ticket.property?.cover_photo_url ? (
                        <img
                          src={ticket.property.cover_photo_url}
                          alt={ticket.property.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Building2 className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm line-clamp-1 group-hover:text-primary transition-colors">
                        {ticket.subject}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        {ticket.property?.name}
                      </p>

                      {ticket.natureza === "compra" && (
                        <Badge variant="outline" className="mt-1 text-[10px] border-primary/30 text-primary bg-primary/10">
                          <ShoppingCart className="h-3 w-3 mr-1" />
                          Compra
                        </Badge>
                      )}

                      {/* Decision Made Badge */}
                      {ticket.owner_decision && (
                        <Badge 
                          variant="outline" 
                          className={`mt-1 text-[10px] ${
                            ticket.owner_decision === 'owner_will_fix'
                              ? 'border-info/30 text-info bg-info/10'
                              : 'border-success/30 text-success bg-success/10'
                          }`}
                        >
                          {ticket.owner_decision === 'owner_will_fix' ? '✓ Você assumiu' : '✓ Delegado à gestão'}
                        </Badge>
                      )}
                      
                      {ticket.scheduled_at && (
                        <p className="text-xs text-info mt-1 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Agendado: {format(new Date(ticket.scheduled_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                        </p>
                      )}
                    </div>

                    {/* Balão de conversa: abre o chat direto, sem passar pelo popup */}
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="icon"
                        className="relative h-9 w-9 rounded-full border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
                        onClick={(e) => handleOpenChat(ticket, e)}
                        aria-label={unreadCount > 0 ? `Conversar com a equipe (${unreadCount} não lidas)` : "Conversar com a equipe"}
                        title="Conversar com a equipe"
                      >
                        <MessageCircle className="h-4 w-4" aria-hidden="true" />
                        {unreadCount > 0 && (
                          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground ring-2 ring-background">
                            {unreadCount > 9 ? "9+" : unreadCount}
                          </span>
                        )}
                      </Button>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>

                  {/* Quick Decision Buttons - Show when decision is needed */}
                  {showDecisionButtons && (
                    <div className="mb-4 rounded-lg border border-dashed border-primary/40 bg-background p-3">
                      <p className="text-xs text-muted-foreground mb-2 font-medium">
                        {isOverdue ? '⏰ Prazo expirado - ' : ''}Como você gostaria de proceder?
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 text-xs gap-1.5"
                          disabled={isDeciding}
                          onClick={(e) => handleDecision(ticket.id, 'owner_will_fix', e)}
                        >
                          <Wrench className="h-3.5 w-3.5" />
                          Assumir execução
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 text-xs gap-1.5"
                          disabled={isDeciding}
                          onClick={(e) => handleDecision(ticket.id, 'pm_will_fix', e)}
                        >
                          <Users className="h-3.5 w-3.5" />
                          Delegar à gestão
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Etapas (a mesma linha do popup); some enquanto a decisão está pendente */}
                  {!showDecisionButtons && <EtapasManutencao etapa={currentStep} />}
                </div>
              );
            })}
          </div>
      </CaixaOperacao>

      <MaintenanceDetailsDialog
        open={chatOpen}
        onOpenChange={(open) => {
          setChatOpen(open);
          if (!open) setSelectedTicket(null);
        }}
        maintenanceId={selectedTicket?.id || null}
      />

      <MaintenanceChatDialog
        open={!!chatTicket}
        onOpenChange={(aberto) => {
          if (!aberto) setChatTicket(null);
        }}
        ticketId={chatTicket?.id ?? null}
        ticketSubject={chatTicket?.subject}
        propertyName={chatTicket?.property?.name}
        onTicketUpdated={() => void refetch()}
      />
    </>
  );
}
