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

type TicketType = "duvida" | "cobranca" | "bloqueio_data" | "financeiro" | "outros" | "informacao" | "conversar_hospedes" | "melhorias_compras";

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
  informacao: "Informação",
  conversar_hospedes: "Hóspedes",
  melhorias_compras: "Melhorias",
};

const TICKET_TYPE_ICONS: Record<TicketType, React.ReactNode> = {
  duvida: <HelpCircle className="h-3 w-3" />,
  cobranca: <DollarSign className="h-3 w-3" />,
  bloqueio_data: <Lock className="h-3 w-3" />,
  financeiro: <DollarSign className="h-3 w-3" />,
  outros: <Info className="h-3 w-3" />,
  informacao: <Info className="h-3 w-3" />,
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
      <Card className="border-2 border-blue-200 dark:border-blue-800">
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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
          <div className="grid grid-cols-2 gap-2 w-full max-w-full">
            {columns.map((column) => {
              const columnTickets = getTicketsForColumn(column.key);

              return (
                <div key={column.key} className={`rounded-lg p-2 min-w-0 overflow-hidden w-full ${column.bgColor}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-semibold ${column.color}`}>
                      {column.title}
                    </span>
                    <Badge variant="outline" className="text-xs h-5 px-1.5">
                      {columnTickets.length}
                    </Badge>
                  </div>
                  <ScrollArea className="h-[180px]">
                    <div className="space-y-1 pr-1">
                      {columnTickets.map((ticket) => {
                        const slaInfo = getSlaInfo(ticket.sla_due_at);
                        
                        return (
                          <div
                            key={ticket.id}
                            onClick={() => navigate(`/ticket-detalhes/${ticket.id}`)}
                            className="bg-card rounded px-1.5 py-1 shadow-sm cursor-pointer hover:shadow-md transition-shadow flex items-center gap-1 w-full overflow-hidden"
                          >
                            {/* Photo */}
                            {ticket.property?.cover_photo_url ? (
                              <img
                                src={ticket.property.cover_photo_url}
                                alt=""
                                className="w-6 h-6 rounded object-cover flex-shrink-0"
                              />
                            ) : (
                              <div className="w-6 h-6 rounded bg-muted flex items-center justify-center flex-shrink-0">
                                <Building className="h-3 w-3 text-muted-foreground" />
                              </div>
                            )}
                            
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1">
                                <span className="font-medium truncate text-[9px]">
                                  {ticket.property?.name || "Sem unidade"}
                                </span>
                                <span className="text-[8px] px-0.5 bg-muted rounded flex-shrink-0">
                                  {TICKET_TYPE_ICONS[ticket.ticket_type]}
                                </span>
                              </div>
                              <p className="text-muted-foreground truncate text-[8px]">
                                {ticket.subject}
                              </p>
                            </div>
                            
                            {/* SLA + Chat */}
                            <div className="flex items-center gap-0.5 flex-shrink-0">
                              {slaInfo && (
                                <span className={`text-[8px] ${slaInfo.colorClass}`}>
                                  {slaInfo.display}
                                </span>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-5 w-5 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openChatDialog(ticket, e);
                                }}
                              >
                                <MessageSquare className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                      {columnTickets.length === 0 && (
                        <p className="text-[8px] text-muted-foreground text-center py-2">
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
