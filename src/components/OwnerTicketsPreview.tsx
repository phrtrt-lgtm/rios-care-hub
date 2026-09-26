import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate, useLocation } from "react-router-dom";
import { saveScrollPosition } from "@/lib/navigation";
import { MessageSquare, Building2, Ticket, ArrowRight } from "lucide-react";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useChatPreloader } from "@/hooks/useChatPreloader";
import { MaintenanceChatDialog } from "@/components/MaintenanceChatDialog";
import { ownerScopeFilter } from "@/lib/ownerScope";
import {
  BotaoLinha,
  CaixaCarregando,
  CaixaOperacao,
  CaixaVazia,
  LinhaCaixa,
  MiniaturaImovel,
  SeloContagem,
} from "@/components/painel/CaixaOperacao";

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

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  novo: { label: "Novo", className: "border-info/30 bg-info/10 text-info" },
  em_analise: { label: "Em análise", className: "border-warning/30 bg-warning/10 text-warning" },
  aguardando_info: { label: "Aguardando info", className: "border-warning/30 bg-warning/10 text-warning" },
  em_execucao: { label: "Em execução", className: "border-primary/30 bg-primary/10 text-primary" },
  concluido: { label: "Concluído", className: "border-success/30 bg-success/10 text-success" },
  cancelado: { label: "Cancelado", className: "border-destructive/30 bg-destructive/10 text-destructive" },
};

export function OwnerTicketsPreview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
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
        .or(await ownerScopeFilter(user.id))
        .neq("ticket_type", "manutencao")
        .in("status", ["novo", "em_analise", "aguardando_info"])
        .order("created_at", { ascending: false });

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

      return sorted as unknown as OwnerTicket[];
    },
    enabled: !!user,
  });

  const ticketIds = tickets?.map((t) => t.id) || [];
  const { unreadCounts, markAsRead } = useUnreadMessages(ticketIds);
  useChatPreloader(ticketIds);

  const handleOpenChat = (ticket: OwnerTicket) => {
    setSelectedTicket(ticket);
    setChatOpen(true);
    markAsRead(ticket.id);
  };

  if (isLoading) {
    return <CaixaCarregando icone={<Ticket />} titulo="Chamados em aberto" tom="info" linhas={2} />;
  }

  return (
    <>
      <CaixaOperacao
        icone={<Ticket />}
        titulo="Chamados em aberto"
        tom="info"
        selos={(tickets?.length || 0) > 0 && <SeloContagem>{tickets?.length}</SeloContagem>}
        acoes={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/meus-chamados")}
            className="h-7 gap-1 px-2 text-xs text-info hover:text-info"
          >
            Ver todos
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        }
      >
        {!tickets || tickets.length === 0 ? (
          <CaixaVazia
            icone={<Ticket className="h-5 w-5" />}
            titulo="Nenhum chamado em aberto"
            descricao="Precisa de algo? Abra um chamado e a equipe responde por aqui."
          />
        ) : (
          <div className="max-h-[360px] space-y-1 overflow-y-auto pr-1">
            {tickets.map((ticket) => {
              const statusConfig = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.novo;
              return (
                <LinhaCaixa
                  key={ticket.id}
                  miniatura={
                    <MiniaturaImovel
                      url={ticket.property?.cover_photo_url}
                      alt={ticket.property?.name}
                      fallback={<Building2 />}
                    />
                  }
                  titulo={ticket.subject}
                  subtitulo={
                    <>
                      {ticket.property?.name}
                      {ticket.property?.name ? " · " : ""}
                      {format(new Date(ticket.created_at), "dd/MM", { locale: ptBR })}
                    </>
                  }
                  meta={
                    <Badge variant="outline" className={`h-5 px-1.5 text-[10px] font-medium ${statusConfig.className}`}>
                      {statusConfig.label}
                    </Badge>
                  }
                  acoes={
                    <BotaoLinha
                      rotulo="Abrir conversa do chamado"
                      naoLidas={unreadCounts[ticket.id] || 0}
                      onClick={() => handleOpenChat(ticket)}
                    >
                      <MessageSquare />
                    </BotaoLinha>
                  }
                  onClick={() => (saveScrollPosition(pathname), navigate(`/ticket-detalhes/${ticket.id}`))}
                />
              );
            })}
          </div>
        )}
      </CaixaOperacao>

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
