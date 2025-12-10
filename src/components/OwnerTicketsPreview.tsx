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
  informacao: "Informação",
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
          property:properties(id, name, cover_photo_url)
        `)
        .eq("owner_id", user.id)
        .neq("ticket_type", "manutencao")
        .in("status", ["novo", "em_analise", "aguardando_info"])
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      return data as unknown as OwnerTicket[];
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
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!tickets || tickets.length === 0) {
    return null;
  }

  return (
    <>
      <Card className="overflow-hidden border-blue-500/20">
        <CardHeader className="pb-3 bg-gradient-to-r from-blue-500/5 to-transparent">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Ticket className="h-5 w-5 text-blue-500" />
              Chamados em Aberto
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="font-medium">
                {tickets.length}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/meus-chamados")}
                className="w-full sm:w-auto"
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                Ver todos
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="space-y-3">
            {tickets.map((ticket) => {
              const statusConfig = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.novo;
              const unreadCount = unreadCounts[ticket.id] || 0;

              return (
                <div
                  key={ticket.id}
                  className="p-3 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer transition-colors group"
                  onClick={() => navigate(`/ticket-detalhes/${ticket.id}`)}
                >
                  <div className="flex items-start gap-3">
                    {/* Property photo */}
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                      {ticket.property?.cover_photo_url ? (
                        <img
                          src={ticket.property.cover_photo_url}
                          alt={ticket.property.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={statusConfig.variant} className="text-[10px] px-1.5 py-0">
                          {statusConfig.label}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {TICKET_TYPE_LABELS[ticket.ticket_type] || ticket.ticket_type}
                        </span>
                      </div>
                      <h4 className="font-medium text-sm line-clamp-1 group-hover:text-primary transition-colors">
                        {ticket.subject}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        {ticket.property?.name} • {format(new Date(ticket.created_at), "dd/MM", { locale: ptBR })}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[10px] relative gap-1"
                        onClick={(e) => handleOpenChat(ticket, e)}
                      >
                        <MessageSquare className="h-3 w-3" />
                        <span>Msgs</span>
                        {unreadCount > 0 && (
                          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                            {unreadCount > 9 ? "9+" : unreadCount}
                          </span>
                        )}
                      </Button>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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
