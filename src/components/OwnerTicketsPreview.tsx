import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { MessageSquare, Building2, Ticket, ChevronRight, ExternalLink } from "lucide-react";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useChatPreloader } from "@/hooks/useChatPreloader";
import { MaintenanceChatDialog } from "@/components/MaintenanceChatDialog";

interface OwnerTicket {
  id: string;
  subject: string;
  status: string;
  ticket_type: string;
  created_at: string;
  property: {
    id: string;
    name: string;
    cover_photo_url: string | null;
  } | null;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  novo: { label: "Novo", variant: "default" },
  em_analise: { label: "Em Análise", variant: "secondary" },
  aguardando_info: { label: "Aguardando Info", variant: "outline" },
  em_execucao: { label: "Em Execução", variant: "secondary" },
  concluido: { label: "Concluído", variant: "outline" },
  cancelado: { label: "Cancelado", variant: "destructive" },
};

const TICKET_TYPE_LABELS: Record<string, string> = {
  duvida: "Dúvida",
  manutencao: "Manutenção",
  cobranca: "Cobrança",
  bloqueio_data: "Bloqueio de Data",
  financeiro: "Financeiro",
  outros: "Outros",
  conversar_hospedes: "Conversa com Hóspedes",
  melhorias_compras: "Melhorias/Compras",
};

export function OwnerTicketsPreview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedTicket, setSelectedTicket] = useState<OwnerTicket | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["owner-tickets-preview", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("tickets")
        .select(`
          id,
          subject,
          status,
          ticket_type,
          created_at,
          property:properties(id, name, cover_photo_url),
          ticket_messages(created_at)
        `)
        .eq("owner_id", user.id)
        .neq("ticket_type", "manutencao")
        .in("status", ["novo", "em_analise", "aguardando_info"])
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;

      // Sort by most recent message (or ticket creation if no messages)
      const sorted = (data as any[]).sort((a, b) => {
        const aLatest = a.ticket_messages?.length
          ? Math.max(...a.ticket_messages.map((m: any) => new Date(m.created_at).getTime()))
          : new Date(a.created_at).getTime();
        const bLatest = b.ticket_messages?.length
          ? Math.max(...b.ticket_messages.map((m: any) => new Date(m.created_at).getTime()))
          : new Date(b.created_at).getTime();
        return bLatest - aLatest;
      });

      return sorted.slice(0, 5) as unknown as OwnerTicket[];
    },
    enabled: !!user,
  });

  const ticketIds = tickets?.map((t) => t.id) || [];
  const { unreadCounts, markAsRead } = useUnreadMessages(ticketIds);
  useChatPreloader(ticketIds);

  const handleOpenChat = (ticket: OwnerTicket, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTicket(ticket);
    setChatOpen(true);
    markAsRead(ticket.id);
  };

  if (isLoading) {
    return (
      <Card className="overflow-hidden border-blue-500/20">
        <CardHeader className="pb-2 bg-gradient-to-r from-blue-500/5 to-transparent">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="pt-3 px-3">
          <div className="space-y-1.5">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-hidden border-blue-500/20">
        <CardHeader className="pb-2 bg-gradient-to-r from-blue-500/5 to-transparent">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Ticket className="h-5 w-5 text-blue-500" />
              Chamados em Aberto
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="font-medium text-xs">
                {tickets?.length || 0}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/meus-chamados")}
                className="h-7 text-xs"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Ver todos
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-3 px-3">
          {!tickets || tickets.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Nenhum chamado em aberto no momento.
            </div>
          ) : (
            <div className="max-h-[360px] overflow-y-auto space-y-1.5 pr-1">
              {tickets.map((ticket) => {
                const statusConfig = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.novo;
                const unreadCount = unreadCounts[ticket.id] || 0;

                return (
                  <div
                    key={ticket.id}
                    className="rounded-lg border bg-card overflow-hidden"
                  >
                    <div
                      className="p-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => navigate(`/ticket-detalhes/${ticket.id}`)}
                    >
                      <div className="flex items-center gap-2">
                        {/* Property photo */}
                        <div className="w-8 h-8 rounded overflow-hidden bg-muted flex-shrink-0">
                          {ticket.property?.cover_photo_url ? (
                            <img
                              src={ticket.property.cover_photo_url}
                              alt={ticket.property.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Building2 className="h-3 w-3 text-muted-foreground" />
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-xs line-clamp-1">{ticket.subject}</p>
                          <div className="flex items-center gap-1.5">
                            <Badge variant={statusConfig.variant} className="text-[10px] px-1.5 py-0 h-4">
                              {statusConfig.label}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {ticket.property?.name} • {format(new Date(ticket.created_at), "dd/MM", { locale: ptBR })}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-7 p-0 relative"
                            onClick={(e) => handleOpenChat(ticket, e)}
                            title="Chat"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            {unreadCount > 0 && (
                              <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                                {unreadCount > 9 ? "9+" : unreadCount}
                              </span>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <MaintenanceChatDialog
        open={chatOpen}
        onOpenChange={(open) => {
          setChatOpen(open);
          if (!open) setSelectedTicket(null);
        }}
        ticketId={selectedTicket?.id || null}
        ticketSubject={selectedTicket?.subject || ""}
        propertyName={selectedTicket?.property?.name || ""}
      />
    </>
  );
}
