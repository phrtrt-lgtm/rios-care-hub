import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Ticket, ArrowRight, Clock, Building, MessageSquare, HelpCircle, DollarSign, Lock, Info, MessageCircle, ShoppingBag } from "lucide-react";
import { differenceInHours, differenceInMinutes } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useChatPreloader } from "@/hooks/useChatPreloader";
import { MaintenanceChatDialog } from "./MaintenanceChatDialog";

type TicketType = "duvida" | "cobranca" | "bloqueio_data" | "financeiro" | "outros" | "conversar_hospedes" | "melhorias_compras";

type OwnerTicket = {
  id: string;
  subject: string;
  status: string;
  ticket_type: TicketType;
  created_at: string;
  sla_due_at: string | null;
  property: { name: string; cover_photo_url: string | null } | null;
  owner: { name: string } | null;
};

type KanbanColumn = {
  key: string;
  title: string;
  color: string;
  bgColor: string;
};

const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  duvida: "Dúvida",
  cobranca: "Cobrança",
  bloqueio_data: "Bloqueio",
  financeiro: "Financeiro",
  outros: "Outros",
  conversar_hospedes: "Hóspedes",
  melhorias_compras: "Melhorias",
};

const TICKET_TYPE_ICONS: Record<TicketType, React.ReactNode> = {
  duvida: <HelpCircle className="h-3 w-3" />,
  cobranca: <DollarSign className="h-3 w-3" />,
  bloqueio_data: <Lock className="h-3 w-3" />,
  financeiro: <DollarSign className="h-3 w-3" />,
  outros: <Info className="h-3 w-3" />,
  conversar_hospedes: <MessageCircle className="h-3 w-3" />,
  melhorias_compras: <ShoppingBag className="h-3 w-3" />,
};

const columns: KanbanColumn[] = [
  { key: "novo", title: "Novos", color: "text-blue-600", bgColor: "bg-blue-50 dark:bg-blue-950/30" },
  { key: "em_analise", title: "Em Análise", color: "text-amber-600", bgColor: "bg-amber-50 dark:bg-amber-950/30" },
];

export function ChamadosKanbanPreview() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<OwnerTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatDialogOpen, setChatDialogOpen] = useState(false);
  const [chatTicket, setChatTicket] = useState<OwnerTicket | null>(null);

  const ticketIds = useMemo(() => tickets.map(t => t.id), [tickets]);
  const { unreadCounts, markAsRead } = useUnreadMessages(ticketIds);
  
  // Preload chat messages in background for instant opening
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
          id,
          subject,
          status,
          ticket_type,
          created_at,
          sla_due_at,
          property:properties(name, cover_photo_url),
          owner:profiles!tickets_owner_id_fkey(name)
        `)
        .neq("ticket_type", "manutencao")
        .neq("status", "cancelado")
        .neq("status", "concluido")
        .order("sla_due_at", { ascending: true, nullsFirst: false })
        .limit(20);

      if (error) throw error;
      setTickets((data || []) as OwnerTicket[]);
    } catch (error) {
      console.error("Error fetching tickets:", error);
    } finally {
      setLoading(false);
    }
  };

  const getTicketsForColumn = (columnKey: string) => {
    if (columnKey === "novo") {
      return tickets.filter((t) => t.status === "novo");
    }
    if (columnKey === "em_analise") {
      return tickets.filter((t) => ["em_analise", "aguardando_info", "em_execucao"].includes(t.status));
    }
    return [];
  };

  const getSlaInfo = (sla_due_at: string | null) => {
    if (!sla_due_at) return null;
    
    const now = new Date();
    const slaDue = new Date(sla_due_at);
    const hoursLeft = differenceInHours(slaDue, now);
    const minutesLeft = differenceInMinutes(slaDue, now) % 60;
    
    const isExpired = now > slaDue;
    const isUrgent = hoursLeft < 24 && !isExpired;
    
    let colorClass = "text-blue-600";
    if (isExpired) colorClass = "text-red-600";
    else if (isUrgent) colorClass = "text-orange-600";
    
    const display = isExpired 
      ? `-${Math.abs(hoursLeft)}h`
      : `${hoursLeft}h${minutesLeft}m`;
    
    return { display, colorClass };
  };

  const totalPending = tickets.length;

  if (loading) {
    return (
      <Card className="border-2 border-blue-200 dark:border-blue-800 overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-blue-600 animate-pulse" />
            <div className="h-5 w-36 rounded bg-muted shimmer" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 gap-2">
            {[1, 2].map((col) => (
              <div key={col} className="rounded-lg bg-muted/30 p-2 space-y-2">
                <div className="flex justify-between items-center mb-2">
                  <div className="h-3 w-14 rounded bg-muted shimmer" />
                  <div className="h-5 w-6 rounded-full bg-muted shimmer" />
                </div>
                {[1, 2, 3].map((i) => (
                  <div 
                    key={i} 
                    className="rounded-lg bg-card p-2 space-y-2 animate-fade-in"
                    style={{ animationDelay: `${(col * 3 + i) * 50}ms` }}
                  >
                    <div className="h-3 w-3/4 rounded bg-muted shimmer" />
                    <div className="h-2 w-1/2 rounded bg-muted shimmer" />
                    <div className="h-8 w-full rounded bg-muted shimmer mt-2" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-blue-200 dark:border-blue-800 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Ticket className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-lg">Quadro de Chamados</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/admin/chamados")}
            className="text-blue-600 border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950 w-full sm:w-auto"
          >
            Ver quadro completo
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 overflow-hidden">
        {tickets.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Ticket className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhum chamado pendente</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:grid sm:grid-cols-2 sm:gap-2 w-full max-w-full">
            {columns.map((column) => {
              const columnTickets = getTicketsForColumn(column.key);

              return (
                <div key={column.key} className={`rounded-xl p-3 min-w-0 overflow-hidden w-full ${column.bgColor}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-sm font-bold ${column.color}`}>
                      {column.title}
                    </span>
                    <Badge variant="outline" className="text-sm h-6 px-2 font-bold">
                      {columnTickets.length}
                    </Badge>
                  </div>
                  <ScrollArea className="h-[200px] sm:h-[180px]">
                    <div className="space-y-2 pr-1">
                      {columnTickets.map((ticket) => {
                        const slaInfo = getSlaInfo(ticket.sla_due_at);
                        
                        return (
                          <div
                            key={ticket.id}
                            onClick={() => navigate(`/ticket-detalhes/${ticket.id}`)}
                            className="bg-card rounded-xl p-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow w-full border"
                          >
                            {/* Property + Type */}
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm truncate flex-1">
                                {ticket.property?.name || "Sem unidade"}
                              </p>
                              <span className="text-xs px-1.5 py-0.5 bg-muted rounded-full flex-shrink-0 flex items-center gap-1">
                                {TICKET_TYPE_ICONS[ticket.ticket_type]}
                                <span className="hidden sm:inline">{TICKET_TYPE_LABELS[ticket.ticket_type]}</span>
                              </span>
                            </div>
                            
                            {/* Subject */}
                            <p className="text-muted-foreground text-xs line-clamp-2 mt-1">
                              {ticket.subject}
                            </p>
                            
                            {/* SLA */}
                            {slaInfo && (
                              <p className={`text-xs font-medium mt-2 ${slaInfo.colorClass}`}>
                                ⏱ SLA: {slaInfo.display}
                              </p>
                            )}
                            
                            {/* Actions */}
                            <div className="mt-3">
                              <Button
                                size="default"
                                variant="outline"
                                className="w-full h-10 text-sm font-medium"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openChatDialog(ticket, e);
                                }}
                              >
                                <MessageSquare className="h-4 w-4 mr-2" />
                                Abrir Chat
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                      {columnTickets.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          Nenhum item
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Chat Dialog */}
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
