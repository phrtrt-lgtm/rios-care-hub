import { useEffect, useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { saveScrollPosition } from "@/lib/navigation";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Ticket, ArrowRight, MessageSquare } from "lucide-react";
import { QuickAttachmentButton } from "./QuickAttachmentButton";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useChatPreloader } from "@/hooks/useChatPreloader";
import { MaintenanceChatDialog } from "./MaintenanceChatDialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  BotaoExpandir,
  BotaoLinha,
  CaixaCarregando,
  CaixaOperacao,
  CaixaVazia,
  GrupoCaixa,
  LinhaCaixa,
  SeloContagem,
} from "@/components/painel/CaixaOperacao";

const COLLAPSED_LIMIT = 3;
// Expandido mostra tudo; a lista rola dentro da caixa.
const EXPANDED_LIMIT = Number.POSITIVE_INFINITY;

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
  const { pathname } = useLocation();
  const [tickets, setTickets] = useState<OwnerTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatDialogOpen, setChatDialogOpen] = useState(false);
  const [chatTicket, setChatTicket] = useState<OwnerTicket | null>(null);
  const [novosExpanded, setNovosExpanded] = useState(false);
  const [emAndamentoExpanded, setEmAndamentoExpanded] = useState(false);

  const ticketIds = useMemo(() => tickets.map((t) => t.id), [tickets]);
  const { unreadCounts, markAsRead } = useUnreadMessages(ticketIds);
  useChatPreloader(ticketIds);

  const openChatDialog = (ticket: OwnerTicket) => {
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
        .order("sla_due_at", { ascending: true, nullsFirst: false });

      if (error) throw error;
      setTickets((data || []) as OwnerTicket[]);
    } catch (error) {
      console.error("Error fetching tickets:", error);
    } finally {
      setLoading(false);
    }
  };

  const novos = tickets.filter((t) => t.status === "novo");
  const emAndamento = tickets.filter((t) => ["em_analise", "aguardando_info", "em_execucao"].includes(t.status));

  const novosLimit = novosExpanded ? EXPANDED_LIMIT : COLLAPSED_LIMIT;
  const emAndamentoLimit = emAndamentoExpanded ? EXPANDED_LIMIT : COLLAPSED_LIMIT;

  const renderTicketItem = (ticket: OwnerTicket) => (
    <LinhaCaixa
      key={ticket.id}
      titulo={ticket.property?.name || "Sem unidade"}
      subtitulo={ticket.subject}
      onClick={() => (saveScrollPosition(pathname), navigate(`/ticket-detalhes/${ticket.id}`))}
      acoes={
        <>
          <QuickAttachmentButton ticketId={ticket.id} onSuccess={fetchTickets} />
          <BotaoLinha
            rotulo="Abrir conversa do chamado"
            naoLidas={unreadCounts[ticket.id] || 0}
            onClick={() => openChatDialog(ticket)}
          >
            <MessageSquare />
          </BotaoLinha>
        </>
      }
    />
  );

  if (loading) {
    return <CaixaCarregando icone={<Ticket />} titulo="Chamados" tom="info" />;
  }

  return (
    <CaixaOperacao
      icone={<Ticket />}
      titulo="Chamados"
      tom="info"
      selos={tickets.length > 0 && <SeloContagem>{tickets.length}</SeloContagem>}
      acoes={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/admin/chamados")}
          className="h-7 gap-1 px-2 text-xs text-info hover:text-info"
        >
          <span className="hidden sm:inline">Ver todos</span>
          <span className="sm:hidden">Ver</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      }
    >
      {tickets.length === 0 ? (
        <CaixaVazia icone={<Ticket className="h-5 w-5" />} titulo="Nenhum chamado pendente" />
      ) : (
        <div className="space-y-3">
          {/* Novos */}
          {novos.length > 0 && (
            <Collapsible open={novosExpanded} onOpenChange={setNovosExpanded}>
              <GrupoCaixa
                titulo="Novos"
                quantidade={novos.length}
                tom="info"
                acao={
                  novos.length > COLLAPSED_LIMIT && (
                    <CollapsibleTrigger asChild>
                      <BotaoExpandir aberto={novosExpanded} restantes={novos.length - COLLAPSED_LIMIT} />
                    </CollapsibleTrigger>
                  )
                }
              >
                {novos.slice(0, COLLAPSED_LIMIT).map(renderTicketItem)}
                <CollapsibleContent className="max-h-72 space-y-1 overflow-y-auto pr-1">
                  {novos.slice(COLLAPSED_LIMIT, novosLimit).map(renderTicketItem)}
                </CollapsibleContent>
              </GrupoCaixa>
            </Collapsible>
          )}

          {/* Em andamento */}
          {emAndamento.length > 0 && (
            <Collapsible open={emAndamentoExpanded} onOpenChange={setEmAndamentoExpanded}>
              <GrupoCaixa
                titulo="Em andamento"
                quantidade={emAndamento.length}
                tom="warning"
                acao={
                  emAndamento.length > COLLAPSED_LIMIT && (
                    <CollapsibleTrigger asChild>
                      <BotaoExpandir aberto={emAndamentoExpanded} restantes={emAndamento.length - COLLAPSED_LIMIT} />
                    </CollapsibleTrigger>
                  )
                }
              >
                {emAndamento.slice(0, COLLAPSED_LIMIT).map(renderTicketItem)}
                <CollapsibleContent className="max-h-72 space-y-1 overflow-y-auto pr-1">
                  {emAndamento.slice(COLLAPSED_LIMIT, emAndamentoLimit).map(renderTicketItem)}
                </CollapsibleContent>
              </GrupoCaixa>
            </Collapsible>
          )}
        </div>
      )}

      <MaintenanceChatDialog
        open={chatDialogOpen}
        onOpenChange={setChatDialogOpen}
        ticketId={chatTicket?.id || null}
        ticketSubject={chatTicket?.subject || ""}
        propertyName={chatTicket?.property?.name || "Sem unidade"}
        onTicketUpdated={fetchTickets}
      />
    </CaixaOperacao>
  );
}
