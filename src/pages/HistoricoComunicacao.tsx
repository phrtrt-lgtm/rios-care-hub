import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { goBack } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowLeft,
  MessageSquare,
  CreditCard,
  Wrench,
  Bell,
  Search,
  User,
  Building,
  Calendar,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

interface CommunicationEvent {
  id: string;
  type: "ticket_message" | "charge_message" | "notification";
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

export default function HistoricoComunicacao() {
  const { ownerId } = useParams();
  const navigate = useNavigate();
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
      notifications.data?.forEach((notif: any) => {
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
    } catch (error: any) {
      console.error("Error fetching owner data:", error);
      toast.error("Erro ao carregar histórico");
    } finally {
      setLoading(false);
    }
  };

  const getEventIcon = (type: CommunicationEvent["type"]) => {
    switch (type) {
      case "ticket_message":
        return <MessageSquare className="h-4 w-4" />;
      case "charge_message":
        return <CreditCard className="h-4 w-4" />;
      case "notification":
        return <Bell className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getEventColor = (type: CommunicationEvent["type"]) => {
    switch (type) {
      case "ticket_message":
        return "bg-blue-500";
      case "charge_message":
        return "bg-amber-500";
      case "notification":
        return "bg-purple-500";
      default:
        return "bg-gray-500";
    }
  };

  const getEventLabel = (type: CommunicationEvent["type"]) => {
    switch (type) {
      case "ticket_message":
        return "Ticket";
      case "charge_message":
        return "Cobrança";
      case "notification":
        return "Notificação";
      default:
        return "Mensagem";
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const navigateToDetail = (event: CommunicationEvent) => {
    if (event.type === "ticket_message" && event.metadata.ticketId) {
      navigate(`/ticket-detalhes/${event.metadata.ticketId}`);
    } else if (event.type === "charge_message" && event.metadata.chargeId) {
      navigate(`/cobranca-detalhes/${event.metadata.chargeId}`);
    }
  };

  const filteredEvents = events.filter((event) => {
    const matchesSearch =
      event.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.metadata.ticketSubject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.metadata.chargeTitle?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === "all" || event.type === typeFilter;
    return matchesSearch && matchesType;
  });

  // Group events by date
  const groupedEvents = filteredEvents.reduce((groups, event) => {
    const date = format(new Date(event.created_at), "yyyy-MM-dd");
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(event);
    return groups;
  }, {} as Record<string, CommunicationEvent[]>);

  if (!isTeamMember) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Acesso não autorizado</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto flex h-16 items-center gap-4 px-4">
          <Button variant="ghost" size="icon" onClick={() => goBack(navigate)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Histórico de Comunicação</h1>
            {ownerInfo && (
              <p className="text-sm text-muted-foreground">{ownerInfo.name}</p>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Owner Info Card */}
        {loading ? (
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <Skeleton className="h-16 w-16 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-60" />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : ownerInfo ? (
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={ownerInfo.photo_url || undefined} />
                  <AvatarFallback className="text-lg">
                    {getInitials(ownerInfo.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <h2 className="font-semibold">{ownerInfo.name}</h2>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">{ownerInfo.email}</p>
                  {ownerInfo.properties.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      {ownerInfo.properties.map((prop) => (
                        <Badge key={prop.id} variant="outline" className="text-xs">
                          {prop.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-primary">{events.length}</p>
                  <p className="text-xs text-muted-foreground">interações</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar mensagens..."
                  className="pl-9"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="ticket_message">Tickets</SelectItem>
                  <SelectItem value="charge_message">Cobranças</SelectItem>
                  <SelectItem value="notification">Notificações</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Timeline de Comunicação
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-420px)] min-h-[400px]">
              {loading ? (
                <div className="p-4 space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-16 w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredEvents.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p>Nenhuma comunicação encontrada</p>
                </div>
              ) : (
                <div className="p-4">
                  {Object.entries(groupedEvents).map(([date, dayEvents]) => (
                    <div key={date} className="mb-6">
                      {/* Date header */}
                      <div className="flex items-center gap-2 mb-4">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-xs font-medium text-muted-foreground px-2 bg-background">
                          {format(new Date(date), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                        </span>
                        <div className="h-px flex-1 bg-border" />
                      </div>

                      {/* Events */}
                      <div className="space-y-4 relative">
                        {/* Timeline line */}
                        <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />

                        {dayEvents.map((event) => (
                          <div
                            key={event.id}
                            className="flex gap-3 relative cursor-pointer hover:bg-muted/50 rounded-lg p-2 -ml-2 transition-colors"
                            onClick={() => navigateToDetail(event)}
                          >
                            {/* Icon */}
                            <div
                              className={`h-10 w-10 rounded-full flex items-center justify-center text-white z-10 ${getEventColor(event.type)}`}
                            >
                              {getEventIcon(event.type)}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <Badge variant="secondary" className="text-[10px]">
                                  {getEventLabel(event.type)}
                                </Badge>
                                {event.metadata.ticketSubject && (
                                  <span className="text-xs font-medium truncate">
                                    {event.metadata.ticketSubject}
                                  </span>
                                )}
                                {event.metadata.chargeTitle && (
                                  <span className="text-xs font-medium truncate">
                                    {event.metadata.chargeTitle}
                                  </span>
                                )}
                                {event.metadata.propertyName && (
                                  <Badge variant="outline" className="text-[10px]">
                                    {event.metadata.propertyName}
                                  </Badge>
                                )}
                                <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">
                                  {format(new Date(event.created_at), "HH:mm")}
                                </span>
                              </div>

                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {event.content}
                              </p>

                              {event.metadata.authorName && (
                                <div className="flex items-center gap-1.5 mt-1">
                                  <Avatar className="h-4 w-4">
                                    <AvatarImage src={event.metadata.authorPhoto || undefined} />
                                    <AvatarFallback className="text-[8px]">
                                      {getInitials(event.metadata.authorName)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-[10px] text-muted-foreground">
                                    {event.metadata.authorName}
                                  </span>
                                </div>
                              )}
                            </div>

                            {(event.metadata.ticketId || event.metadata.chargeId) && (
                              <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
