import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Ticket, ArrowRight, MessageSquare, ChevronRight } from "lucide-react";
import { differenceInHours } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useChatPreloader } from "@/hooks/useChatPreloader";
import { MaintenanceChatDialog } from "./MaintenanceChatDialog";

type OwnerTicket = {
  id: string;
  subject: string;
  status: string;
  ticket_type: string;
  created_at: string;
  sla_due_at: string | null;
  property: { name: string } | null;
  owner: { name: string } | null;
};

export function ChamadosKanbanPreview() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<OwnerTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatDialogOpen, setChatDialogOpen] = useState(false);
  const [chatTicket, setChatTicket] = useState<OwnerTicket | null>(null);

  const ticketIds = useMemo(() => tickets.map(t => t.id), [tickets]);
  const { unreadCounts, markAsRead } = useUnreadMessages(ticketIds);
  useChatPreloader(ticketIds);

  const openChatDialog = (ticket: OwnerTicket, e: React.MouseEvent) => {
    e.stopPropagation();
    setChatTicket(ticket);
    setChatDialogOpen(true);
    markAsRead(ticket.id);
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      const { data, error } = await supabase
        .from("tickets")
        .select(`
          id, subject, status, ticket_type, created_at, sla_due_at,
          property:properties(name),
          owner:profiles!tickets_owner_id_fkey(name)
        `)
        .neq("ticket_type", "manutencao")
        .neq("status", "cancelado")
        .neq("status", "concluido")
        .order("sla_due_at", { ascending: true, nullsFirst: false })
        .limit(15);

      if (error) throw error;
      setTickets((data || []) as OwnerTicket[]);
    } catch (error) {
      console.error("Error fetching tickets:", error);
    } finally {
      setLoading(false);
    }
  };

  const getSlaColor = (sla_due_at: string | null) => {
    if (!sla_due_at) return "";
    const hoursLeft = differenceInHours(new Date(sla_due_at), new Date());
    if (hoursLeft < 0) return "text-red-600";
    if (hoursLeft < 24) return "text-orange-600";
    return "text-blue-600";
  };

  const getSlaText = (sla_due_at: string | null) => {
    if (!sla_due_at) return "";
    const hoursLeft = differenceInHours(new Date(sla_due_at), new Date());
    if (hoursLeft < 0) return `${Math.abs(hoursLeft)}h atrás`;
    return `${hoursLeft}h`;
  };

  const novos = tickets.filter((t) => t.status === "novo");
  const emAndamento = tickets.filter((t) => ["em_analise", "aguardando_info", "em_execucao"].includes(t.status));

  if (loading) {
    return (
      <Card className="border-blue-200 dark:border-blue-800">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center gap-2">
            <Ticket className="h-4 w-4 text-blue-600 animate-pulse" />
            <div className="h-4 w-32 rounded bg-muted animate-pulse" />
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-blue-200 dark:border-blue-800">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ticket className="h-4 w-4 text-blue-600" />
            <CardTitle className="text-sm">Chamados</CardTitle>
            {tickets.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {tickets.length}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/admin/chamados")}
            className="h-7 text-xs text-blue-600"
          >
            Ver todos <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0">
        {tickets.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Nenhum chamado pendente</p>
        ) : (
          <div className="space-y-3">
            {/* Novos */}
            {novos.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-blue-600 mb-1.5">Novos ({novos.length})</p>
                <div className="space-y-1">
                  {novos.slice(0, 5).map((ticket) => (
                    <div
                      key={ticket.id}
                      className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                      onClick={() => navigate(`/ticket-detalhes/${ticket.id}`)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{ticket.property?.name || "Sem unidade"}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{ticket.subject}</p>
                      </div>
                      {ticket.sla_due_at && (
                        <span className={`text-[10px] font-medium ${getSlaColor(ticket.sla_due_at)}`}>
                          {getSlaText(ticket.sla_due_at)}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
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

            {/* Em andamento */}
            {emAndamento.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-600 mb-1.5">Em andamento ({emAndamento.length})</p>
                <div className="space-y-1">
                  {emAndamento.slice(0, 5).map((ticket) => (
                    <div
                      key={ticket.id}
                      className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                      onClick={() => navigate(`/ticket-detalhes/${ticket.id}`)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{ticket.property?.name || "Sem unidade"}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{ticket.subject}</p>
                      </div>
                      {ticket.sla_due_at && (
                        <span className={`text-[10px] font-medium ${getSlaColor(ticket.sla_due_at)}`}>
                          {getSlaText(ticket.sla_due_at)}
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
