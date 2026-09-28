import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { saveScrollPosition } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CabecalhoPagina, PaginaInterna } from "@/components/painel/PaginaInterna";
import { CaixaOperacao, CaixaVazia, SeloContagem } from "@/components/painel/CaixaOperacao";
import { Etiqueta } from "@/components/painel/Etiqueta";
import { TOM, type Tom } from "@/components/painel/tons";
import { MentionText } from "@/components/comments/MentionText";
import { formatarData } from "@/lib/cobrancaMeta";
import { format } from "date-fns";
import {
  Bell,
  Building,
  CalendarDays,
  ChevronRight,
  CreditCard,
  History,
  Lock,
  MessageSquare,
  Search,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type TipoEvento = "ticket_message" | "charge_message" | "notification";

interface CommunicationEvent {
  id: string;
  type: TipoEvento;
  created_at: string;
  content: string;
  metadata: {
    ticketId?: string;
    ticketSubject?: string;
    chargeId?: string;
    chargeTitle?: string;
    authorName?: string;
    authorRole?: string;
    authorPhoto?: string;
    propertyName?: string;
    notificationType?: string;
  };
}

interface OwnerInfo {
  id: string;
  name: string;
  email: string;
  photo_url: string | null;
  properties: Array<{ id: string; name: string }>;
}

const TIPO_EVENTO: Record<TipoEvento, { rotulo: string; tom: Tom; icone: JSX.Element }> = {
  ticket_message: { rotulo: "Chamado", tom: "info", icone: <MessageSquare className="h-4 w-4" /> },
  charge_message: { rotulo: "Cobrança", tom: "warning", icone: <CreditCard className="h-4 w-4" /> },
  notification: { rotulo: "Notificação", tom: "primary", icone: <Bell className="h-4 w-4" /> },
};

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

export default function HistoricoComunicacao() {
  const { ownerId } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { profile } = useAuth();
  const [ownerInfo, setOwnerInfo] = useState<OwnerInfo | null>(null);
  const [events, setEvents] = useState<CommunicationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const isTeamMember = profile?.role === 'admin' || profile?.role === 'agent' || profile?.role === 'maintenance';

  useEffect(() => {
    if (ownerId && isTeamMember) {
      fetchOwnerData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, isTeamMember]);

  const fetchOwnerData = async () => {
    if (!ownerId) return;

    try {
      // Fetch owner profile
      const { data: ownerData, error: ownerError } = await supabase
        .from("profiles")
        .select("id, name, email, photo_url")
        .eq("id", ownerId)
        .single();

      if (ownerError) throw ownerError;

      // Fetch owner's properties
      const { data: propertiesData } = await supabase
        .from("properties")
        .select("id, name")
        .eq("owner_id", ownerId);

      setOwnerInfo({
        ...ownerData,
        properties: propertiesData || [],
      });

      // Fetch all communication in parallel
      const [ticketMessages, chargeMessages, notifications] = await Promise.all([
        // Ticket messages
        supabase
          .from("ticket_messages")
          .select(`
            id,
            body,
            created_at,
            is_internal,
            author_id,
            ticket_id,
            tickets!inner(subject, owner_id, property_id, properties(name)),
            profiles:author_id(name, role, photo_url)
          `)
          .eq("tickets.owner_id", ownerId)
          .order("created_at", { ascending: false })
          .limit(100),

        // Charge messages
        supabase
          .from("charge_messages")
          .select(`
            id,
            body,
            created_at,
            is_internal,
            author_id,
            charge_id,
            charges!inner(title, owner_id, property_id, properties(name)),
            profiles:author_id(name, role, photo_url)
          `)
          .eq("charges.owner_id", ownerId)
          .order("created_at", { ascending: false })
          .limit(100),

        // Notifications
        supabase
          .from("notifications")
          .select("id, title, message, type, created_at, reference_url")
          .eq("owner_id", ownerId)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      // Transform and combine events
      const allEvents: CommunicationEvent[] = [];

      // Add ticket messages
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ticketMessages.data?.forEach((msg: any) => {
        if (!msg.is_internal) {
          allEvents.push({
            id: `tm-${msg.id}`,
            type: "ticket_message",
            created_at: msg.created_at,
            content: msg.body,
            metadata: {
              ticketId: msg.ticket_id,
              ticketSubject: msg.tickets?.subject,
              authorName: msg.profiles?.name,
              authorRole: msg.profiles?.role,
              authorPhoto: msg.profiles?.photo_url,
              propertyName: msg.tickets?.properties?.name,
            },
          });
        }
      });

      // Add charge messages
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chargeMessages.data?.forEach((msg: any) => {
        if (!msg.is_internal) {
          allEvents.push({
            id: `cm-${msg.id}`,
            type: "charge_message",
            created_at: msg.created_at,
            content: msg.body,
            metadata: {
              chargeId: msg.charge_id,
              chargeTitle: msg.charges?.title,
              authorName: msg.profiles?.name,
              authorRole: msg.profiles?.role,
              authorPhoto: msg.profiles?.photo_url,
              propertyName: msg.charges?.properties?.name,
            },
          });
        }
      });

      // Add notifications
      notifications.data?.forEach((notif) => {
        allEvents.push({
          id: `n-${notif.id}`,
          type: "notification",
          created_at: notif.created_at,
          content: notif.message,
          metadata: {
            notificationType: notif.type,
          },
        });
      });

      // Sort by date
      allEvents.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setEvents(allEvents);
    } catch (error) {
      console.error("Erro ao carregar o histórico:", error);
      toast.error("Erro ao carregar histórico");
    } finally {
      setLoading(false);
    }
  };

  const navigateToDetail = (event: CommunicationEvent) => {
    if (event.type === "ticket_message" && event.metadata.ticketId) {
      saveScrollPosition(pathname);
      navigate(`/ticket-detalhes/${event.metadata.ticketId}`);
    } else if (event.type === "charge_message" && event.metadata.chargeId) {
      saveScrollPosition(pathname);
      navigate(`/cobranca/${event.metadata.chargeId}`);
    }
  };

  const filteredEvents = useMemo(() => {
    const termo = searchTerm.trim().toLowerCase();
    return events.filter((event) => {
      const matchesSearch =
        !termo ||
        event.content.toLowerCase().includes(termo) ||
        event.metadata.ticketSubject?.toLowerCase().includes(termo) ||
        event.metadata.chargeTitle?.toLowerCase().includes(termo);
      const matchesType = typeFilter === "all" || event.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [events, searchTerm, typeFilter]);

  // Agrupa por dia local; a chave "yyyy-MM-dd" é lida de volta com formatarData.
  const groupedEvents = useMemo(
    () =>
      filteredEvents.reduce((groups, event) => {
        const date = format(new Date(event.created_at), "yyyy-MM-dd");
        if (!groups[date]) {
          groups[date] = [];
        }
        groups[date].push(event);
        return groups;
      }, {} as Record<string, CommunicationEvent[]>),
    [filteredEvents],
  );

  const cabecalho = (
    <CabecalhoPagina
      titulo="Histórico de comunicação"
      subtitulo={ownerInfo?.name}
      icone={<History />}
      tom="info"
      voltarPara="/admin/gerenciar-usuarios"
    />
  );

  if (!isTeamMember) {
    return (
      <PaginaInterna largura="media" cabecalho={cabecalho}>
        <Card className="rounded-xl border-border/70">
          <EmptyState
            icon={<Lock className="h-6 w-6" />}
            title="Acesso restrito"
            description="Só a equipe consulta o histórico de comunicação."
          />
        </Card>
      </PaginaInterna>
    );
  }

  return (
    <PaginaInterna largura="media" cabecalho={cabecalho}>
      {/* Proprietário */}
      {loading ? (
        <Card className="rounded-xl border-border/70 p-4" aria-busy="true" aria-label="Carregando proprietário">
          <div className="flex items-center gap-4">
            <Skeleton className="h-14 w-14 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-60" />
            </div>
          </div>
        </Card>
      ) : ownerInfo ? (
        <CaixaOperacao
          icone={<User />}
          titulo="Proprietário"
          tom="primary"
          selos={<SeloContagem title="Interações registradas">{events.length} interações</SeloContagem>}
        >
          <div className="flex items-start gap-4">
            <Avatar className="h-14 w-14">
              <AvatarImage src={ownerInfo.photo_url || undefined} alt="" />
              <AvatarFallback className="text-base">{getInitials(ownerInfo.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-tight">{ownerInfo.name}</p>
              <p className="text-sm text-muted-foreground">{ownerInfo.email}</p>
              {ownerInfo.properties.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Building className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  {ownerInfo.properties.map((prop) => (
                    <Etiqueta key={prop.id} tom="neutral">
                      {prop.name}
                    </Etiqueta>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CaixaOperacao>
      ) : null}

      {/* Filtros */}
      <Card className="rounded-xl border-border/70 p-3 md:p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar mensagens…"
              aria-label="Buscar mensagens"
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-48" aria-label="Tipo de comunicação">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent className="z-50 bg-popover">
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="ticket_message">Chamados</SelectItem>
              <SelectItem value="charge_message">Cobranças</SelectItem>
              <SelectItem value="notification">Notificações</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Linha do tempo */}
      <CaixaOperacao
        icone={<CalendarDays />}
        titulo="Linha do tempo"
        tom="info"
        selos={!loading ? <SeloContagem>{filteredEvents.length}</SeloContagem> : undefined}
      >
        {loading ? (
          <div className="space-y-4" aria-busy="true" aria-label="Carregando histórico">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-12 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <EmptyState
            ilustracao="conversa"
            title="Nenhuma comunicação ainda"
            description="Mensagens de chamados, de cobranças e notificações deste proprietário aparecem aqui."
          />
        ) : filteredEvents.length === 0 ? (
          <CaixaVazia
            icone={<Search className="h-5 w-5" />}
            titulo="Nada com esses filtros"
            descricao="Mude o tipo ou limpe a busca."
          />
        ) : (
          <div className="space-y-5">
            {Object.entries(groupedEvents).map(([date, dayEvents]) => (
              <section key={date} aria-label={formatarData(date, "EEEE, dd 'de' MMMM")}>
                <div className="mb-2 flex items-center gap-2">
                  <div className="h-px flex-1 bg-border" aria-hidden="true" />
                  <span className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {formatarData(date, "EEEE, dd 'de' MMMM")}
                  </span>
                  <div className="h-px flex-1 bg-border" aria-hidden="true" />
                </div>

                <div className="relative space-y-1">
                  <div className="absolute bottom-0 left-[26px] top-0 w-px bg-border" aria-hidden="true" />

                  {dayEvents.map((event) => {
                    const meta = TIPO_EVENTO[event.type];
                    const navegavel =
                      (event.type === "ticket_message" && !!event.metadata.ticketId) ||
                      (event.type === "charge_message" && !!event.metadata.chargeId);
                    const assunto = event.metadata.ticketSubject || event.metadata.chargeTitle;
                    return (
                      <div
                        key={event.id}
                        role={navegavel ? "button" : undefined}
                        tabIndex={navegavel ? 0 : undefined}
                        onClick={navegavel ? () => navigateToDetail(event) : undefined}
                        onKeyDown={(e) => {
                          if (navegavel && (e.key === "Enter" || e.key === " ")) {
                            e.preventDefault();
                            navigateToDetail(event);
                          }
                        }}
                        className={cn(
                          "relative flex gap-3 rounded-lg px-2 py-2 transition-colors",
                          navegavel && "cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        )}
                      >
                        <span
                          className={cn("z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-4 ring-card", TOM[meta.tom].caixa)}
                          aria-hidden="true"
                        >
                          {meta.icone}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Etiqueta tom={meta.tom}>{meta.rotulo}</Etiqueta>
                            {assunto && <span className="min-w-0 truncate text-xs font-medium">{assunto}</span>}
                            {event.metadata.propertyName && (
                              <Etiqueta tom="neutral">{event.metadata.propertyName}</Etiqueta>
                            )}
                            <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                              {format(new Date(event.created_at), "HH:mm")}
                            </span>
                          </div>

                          <MentionText body={event.content} className="mt-1 line-clamp-2 text-muted-foreground" />

                          {event.metadata.authorName && (
                            <div className="mt-1 flex items-center gap-1.5">
                              <Avatar className="h-4 w-4">
                                <AvatarImage src={event.metadata.authorPhoto || undefined} alt="" />
                                <AvatarFallback className="text-[8px]">{getInitials(event.metadata.authorName)}</AvatarFallback>
                              </Avatar>
                              <span className="text-[10px] text-muted-foreground">{event.metadata.authorName}</span>
                            </div>
                          )}
                        </div>

                        {navegavel && (
                          <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </CaixaOperacao>
    </PaginaInterna>
  );
}
