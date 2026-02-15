import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  ArrowLeft, Calendar, Link2, Plus, RefreshCw, Trash2, Building2, 
  Sparkles, ShoppingCart, AlertCircle, Clock, CheckCircle2, Loader2,
  Wrench, CalendarDays, Filter, SlidersHorizontal
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, differenceInDays, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";

interface IcalLink {
  id: string;
  property_id: string;
  ical_url: string;
  source_label: string;
  last_synced_at: string | null;
  sync_error: string | null;
  property?: { name: string; address: string | null };
}

interface Reservation {
  id: string;
  property_id: string;
  check_in: string;
  check_out: string;
  guest_name: string | null;
  summary: string | null;
  status: string;
  property?: { name: string; address: string | null };
}

interface ServiceSummary {
  service_type: string;
  properties: Array<{
    name: string;
    address: string;
    tasks: string[];
    available_dates: Array<{ start: string; end: string }>;
    next_guest_checkin: string | null;
    urgency: string;
  }>;
}

interface ShoppingItem {
  property_name: string;
  property_address: string;
  next_checkin: string | null;
  items: string[];
  notes: string;
}

interface Alert {
  type: string;
  property_name: string;
  message: string;
  deadline: string;
}

interface PendingService {
  id: string;
  category: string;
  description: string;
  source: 'inspection' | 'ticket';
  property_id: string;
}

interface PropertyServiceData {
  property_id: string;
  property_name: string;
  property_address: string | null;
  services: PendingService[];
  available_windows: Array<{ start: string; end: string; days: number }>;
}

export default function CalendarioReservas() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [icalLinks, setIcalLinks] = useState<IcalLink[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [properties, setProperties] = useState<Array<{ id: string; name: string; address: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newPropertyId, setNewPropertyId] = useState("");
  const [newSourceLabel, setNewSourceLabel] = useState("channel_manager");

  // Report state
  const [serviceSummaries, setServiceSummaries] = useState<ServiceSummary[]>([]);
  const [shoppingLists, setShoppingLists] = useState<ShoppingItem[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [reportType, setReportType] = useState("all");

  // Report customization
  const [selectedProperties, setSelectedProperties] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>(["inspection", "ticket"]);
  const [showSections, setShowSections] = useState<string[]>(["services", "availability", "shopping", "alerts"]);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Property services state
  const [propertyServices, setPropertyServices] = useState<PropertyServiceData[]>([]);

  // Calculate availability windows for properties that have reservations
  const calculateAvailabilityWindows = useCallback((
    propId: string, 
    propReservations: Reservation[]
  ): Array<{ start: string; end: string; days: number }> => {
    const today = new Date().toISOString().split("T")[0];
    const sixtyDays = format(addDays(new Date(), 60), "yyyy-MM-dd");
    
    const sorted = [...propReservations]
      .filter(r => r.check_out >= today)
      .sort((a, b) => a.check_in.localeCompare(b.check_in));
    
    const gaps: Array<{ start: string; end: string; days: number }> = [];
    let cursor = today;
    
    for (const res of sorted) {
      if (res.check_in > cursor) {
        const days = differenceInDays(parseISO(res.check_in), parseISO(cursor));
        if (days >= 1) {
          gaps.push({ start: cursor, end: res.check_in, days });
        }
      }
      if (res.check_out > cursor) cursor = res.check_out;
    }
    
    if (cursor < sixtyDays) {
      const days = differenceInDays(parseISO(sixtyDays), parseISO(cursor));
      if (days >= 1) {
        gaps.push({ start: cursor, end: sixtyDays, days });
      }
    }
    
    return gaps.slice(0, 5);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [linksRes, reservationsRes, propertiesRes, inspectionItemsRes, ticketsRes] = await Promise.all([
        supabase.from("property_ical_links").select("*, property:property_id(name, address)"),
        supabase.from("reservations").select("*, property:property_id(name, address)").gte("check_out", new Date().toISOString().split("T")[0]).order("check_in"),
        supabase.from("properties").select("id, name, address").order("name"),
        supabase.from("inspection_items").select("id, description, category, status, inspection:inspection_id(property_id)").in("status", ["pending", "management", "owner", "guest"]),
        supabase.from("tickets").select("id, subject, description, property_id, kind").in("status", ["novo", "em_analise", "aguardando_info", "em_execucao"]),
      ]);

      const links = (linksRes.data as any) || [];
      const res = (reservationsRes.data as any) || [];
      const props = propertiesRes.data || [];
      
      setIcalLinks(links);
      setReservations(res);
      setProperties(props);

      // Build services per property (only for properties with iCal links)
      const linkedPropertyIds = new Set(links.map((l: any) => l.property_id));
      
      const services: PendingService[] = [];
      
      // From inspection items
      (inspectionItemsRes.data || []).forEach((item: any) => {
        const propId = item.inspection?.property_id;
        if (propId && linkedPropertyIds.has(propId)) {
          services.push({
            id: item.id,
            category: item.category,
            description: item.description,
            source: 'inspection',
            property_id: propId,
          });
        }
      });
      
      // From tickets
      (ticketsRes.data || []).forEach((t: any) => {
        if (t.property_id && linkedPropertyIds.has(t.property_id)) {
          services.push({
            id: t.id,
            category: t.kind || 'Manutenção',
            description: t.subject,
            source: 'ticket',
            property_id: t.property_id,
          });
        }
      });

      // Group by property and calculate windows
      const resByProp = res.reduce((acc: Record<string, Reservation[]>, r: Reservation) => {
        if (!acc[r.property_id]) acc[r.property_id] = [];
        acc[r.property_id].push(r);
        return acc;
      }, {} as Record<string, Reservation[]>);

      const propServiceData: PropertyServiceData[] = [];
      linkedPropertyIds.forEach((propId: string) => {
        const prop = props.find((p) => p.id === propId);
        const propServices = services.filter(s => s.property_id === propId);
        if (propServices.length === 0) return;
        
        const windows = calculateAvailabilityWindows(propId, resByProp[propId] || []);
        propServiceData.push({
          property_id: propId,
          property_name: prop?.name || "Propriedade",
          property_address: prop?.address || null,
          services: propServices,
          available_windows: windows,
        });
      });
      
      setPropertyServices(propServiceData);
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  }, [calculateAvailabilityWindows]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddLink = async () => {
    if (!newUrl || !newPropertyId) {
      toast.error("URL e propriedade são obrigatórios");
      return;
    }

    const { error } = await supabase.from("property_ical_links").insert({
      property_id: newPropertyId,
      ical_url: newUrl,
      source_label: newSourceLabel,
    });

    if (error) {
      toast.error("Erro ao adicionar link: " + error.message);
      return;
    }

    toast.success("Link iCal adicionado!");
    setAddDialogOpen(false);
    setNewUrl("");
    setNewPropertyId("");
    fetchData();
  };

  const handleDeleteLink = async (id: string) => {
    if (!confirm("Remover este link iCal?")) return;
    const { error } = await supabase.from("property_ical_links").delete().eq("id", id);
    if (error) toast.error("Erro ao remover: " + error.message);
    else {
      toast.success("Link removido!");
      fetchData();
    }
  };

  const handleSync = async (propertyId?: string) => {
    setSyncing(true);
    try {
      const url = propertyId
        ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-ical?property_id=${propertyId}`
        : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-ical`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");

      toast.success(data.message || "Sincronizado com sucesso!");
      fetchData();
    } catch (err: any) {
      toast.error("Erro ao sincronizar: " + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleGenerateReport = async () => {
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-service-summary`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ 
            report_type: reportType,
            property_ids: selectedProperties.length > 0 ? selectedProperties : undefined,
            sources: selectedSources,
            sections: showSections,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");

      setServiceSummaries(data.service_summaries || []);
      setShoppingLists(data.shopping_lists || []);
      setAlerts(data.alerts || []);
      toast.success("Relatório gerado com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao gerar relatório: " + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const urgencyColor = (urgency: string) => {
    switch (urgency) {
      case "alta": return "destructive";
      case "media": return "outline";
      default: return "secondary";
    }
  };

  // Group reservations by property
  const reservationsByProperty = reservations.reduce<Record<string, Reservation[]>>((acc, r) => {
    const key = r.property_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 pb-24 md:pb-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-bold">Calendário de Reservas</h1>
            <p className="text-sm text-muted-foreground">
              Sincronize calendários iCal e gere relatórios inteligentes
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleSync()} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sincronizando..." : "Sincronizar Todos"}
            </Button>
            <Button onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar iCal
            </Button>
          </div>
        </div>

        <Tabs defaultValue="calendar" className="space-y-4">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="calendar">
              <Calendar className="h-4 w-4 mr-2" />
              Calendário
            </TabsTrigger>
            <TabsTrigger value="links">
              <Link2 className="h-4 w-4 mr-2" />
              Links iCal ({icalLinks.length})
            </TabsTrigger>
            <TabsTrigger value="reports">
              <Sparkles className="h-4 w-4 mr-2" />
              Relatório IA
            </TabsTrigger>
          </TabsList>

          {/* Calendar Tab */}
          <TabsContent value="calendar" className="space-y-4">
            {Object.keys(reservationsByProperty).length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Calendar className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold">Nenhuma reserva encontrada</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Adicione links iCal e sincronize para ver as reservas
                  </p>
                </CardContent>
              </Card>
            ) : (
              Object.entries(reservationsByProperty).map(([propId, propReservations]) => {
                const prop = properties.find((p) => p.id === propId);
                return (
                  <Card key={propId}>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Building2 className="h-4 w-4 text-primary" />
                        {prop?.name || "Propriedade"}
                      </CardTitle>
                      {prop?.address && (
                        <CardDescription className="text-xs">{prop.address}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {propReservations.map((res) => {
                          const daysUntil = differenceInDays(parseISO(res.check_in), new Date());
                          const isActive = daysUntil <= 0 && differenceInDays(parseISO(res.check_out), new Date()) > 0;
                          return (
                            <div
                              key={res.id}
                              className={`flex items-center justify-between p-3 rounded-lg border ${
                                isActive ? "bg-primary/5 border-primary/20" : daysUntil <= 3 ? "bg-yellow-50 border-yellow-200 dark:bg-yellow-500/5 dark:border-yellow-500/20" : "bg-muted/30"
                              }`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm truncate">
                                    {res.guest_name || res.summary || "Reserva"}
                                  </span>
                                  {isActive && (
                                    <Badge variant="default" className="text-xs">Ativo</Badge>
                                  )}
                                  {!isActive && daysUntil <= 3 && daysUntil >= 0 && (
                                    <Badge variant="outline" className="text-xs text-yellow-600">Em {daysUntil}d</Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {format(parseISO(res.check_in), "dd MMM", { locale: ptBR })} → {format(parseISO(res.check_out), "dd MMM yyyy", { locale: ptBR })}
                                </p>
                              </div>
                              <div className="text-right text-xs text-muted-foreground">
                                {differenceInDays(parseISO(res.check_out), parseISO(res.check_in))} noites
                              </div>
                            </div>
                           );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}

            {/* Serviços Pendentes com Datas Disponíveis */}
            {propertyServices.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-primary" />
                  Serviços Pendentes & Datas Disponíveis
                </h3>
                {propertyServices.map((ps) => (
                  <Card key={ps.property_id}>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Building2 className="h-4 w-4 text-primary" />
                        {ps.property_name}
                        <Badge variant="secondary" className="text-xs ml-auto">
                          {ps.services.length} serviço(s)
                        </Badge>
                      </CardTitle>
                      {ps.property_address && (
                        <CardDescription className="text-xs">{ps.property_address}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Available windows */}
                      {ps.available_windows.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            Próximas janelas disponíveis
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {ps.available_windows.map((w, i) => (
                              <Badge key={i} variant="outline" className="text-xs bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/20">
                                {format(parseISO(w.start), "dd/MM")} → {format(parseISO(w.end), "dd/MM")}
                                <span className="ml-1 opacity-70">({w.days}d)</span>
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {ps.available_windows.length === 0 && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Sem janelas disponíveis nos próximos 60 dias
                        </p>
                      )}

                      {/* Services grouped by category */}
                      <div className="space-y-1.5">
                        {Object.entries(
                          ps.services.reduce<Record<string, PendingService[]>>((acc, s) => {
                            if (!acc[s.category]) acc[s.category] = [];
                            acc[s.category].push(s);
                            return acc;
                          }, {})
                        ).map(([category, items]) => (
                          <div key={category} className="p-2.5 rounded-lg border bg-muted/30">
                            <p className="text-xs font-semibold mb-1">{category}</p>
                            {items.map((item) => (
                              <p key={item.id} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                <span className="text-primary mt-0.5">•</span>
                                {item.description}
                                {item.source === 'ticket' && (
                                  <Badge variant="outline" className="text-[10px] ml-1 py-0">chamado</Badge>
                                )}
                              </p>
                            ))}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Links Tab */}
          <TabsContent value="links" className="space-y-4">
            {icalLinks.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Link2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold">Nenhum link iCal configurado</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Adicione o link iCal do seu channel manager para cada unidade
                  </p>
                  <Button className="mt-4" onClick={() => setAddDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Link
                  </Button>
                </CardContent>
              </Card>
            ) : (
              icalLinks.map((link) => (
                <Card key={link.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-primary" />
                          {(link as any).property?.name || "Propriedade"}
                        </CardTitle>
                        <CardDescription className="text-xs mt-1 truncate max-w-md">
                          {link.ical_url}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSync(link.property_id)}
                          disabled={syncing}
                        >
                          <RefreshCw className={`h-3 w-3 mr-1 ${syncing ? "animate-spin" : ""}`} />
                          Sync
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteLink(link.id)}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {link.last_synced_at
                          ? `Último sync: ${format(parseISO(link.last_synced_at), "dd/MM HH:mm")}`
                          : "Nunca sincronizado"}
                      </span>
                      <Badge variant="secondary" className="text-xs">{link.source_label}</Badge>
                      {link.sync_error && (
                        <span className="text-destructive flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {link.sync_error}
                        </span>
                      )}
                      {link.last_synced_at && !link.sync_error && (
                        <span className="text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          OK
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  Personalizar Relatório
                </CardTitle>
                <CardDescription className="text-xs">
                  Configure os filtros antes de gerar o relatório com IA
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Service Type Filter */}
                <div>
                  <Label className="text-xs font-medium">Tipo de Serviço</Label>
                  <Select value={reportType} onValueChange={setReportType}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os tipos</SelectItem>
                      <SelectItem value="Hidráulica">Hidráulica</SelectItem>
                      <SelectItem value="Elétrica">Elétrica</SelectItem>
                      <SelectItem value="Marcenaria">Marcenaria</SelectItem>
                      <SelectItem value="Itens">Itens</SelectItem>
                      <SelectItem value="Estrutural">Estrutural</SelectItem>
                      <SelectItem value="Refrigeração">Refrigeração</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Advanced filters toggle */}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-xs text-muted-foreground px-0 h-auto"
                  onClick={() => setFiltersExpanded(!filtersExpanded)}
                >
                  <Filter className="h-3 w-3 mr-1" />
                  {filtersExpanded ? "Ocultar filtros avançados" : "Filtros avançados"}
                </Button>

                {filtersExpanded && (
                  <div className="space-y-4 p-3 rounded-lg border bg-muted/30">
                    {/* Property Filter */}
                    <div>
                      <Label className="text-xs font-medium mb-2 block">Imóveis</Label>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        <div className="flex items-center gap-2">
                          <Checkbox 
                            id="all-properties"
                            checked={selectedProperties.length === 0}
                            onCheckedChange={() => setSelectedProperties([])}
                          />
                          <label htmlFor="all-properties" className="text-xs font-medium cursor-pointer">
                            Todos os imóveis
                          </label>
                        </div>
                        {properties.map((p) => (
                          <div key={p.id} className="flex items-center gap-2">
                            <Checkbox 
                              id={`prop-${p.id}`}
                              checked={selectedProperties.includes(p.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedProperties(prev => [...prev, p.id]);
                                } else {
                                  setSelectedProperties(prev => prev.filter(id => id !== p.id));
                                }
                              }}
                            />
                            <label htmlFor={`prop-${p.id}`} className="text-xs cursor-pointer">
                              {p.name}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Source Filter */}
                    <div>
                      <Label className="text-xs font-medium mb-2 block">Fonte dos Itens</Label>
                      <div className="flex flex-wrap gap-3">
                        <div className="flex items-center gap-2">
                          <Checkbox 
                            id="source-inspection"
                            checked={selectedSources.includes("inspection")}
                            onCheckedChange={(checked) => {
                              if (checked) setSelectedSources(prev => [...prev, "inspection"]);
                              else setSelectedSources(prev => prev.filter(s => s !== "inspection"));
                            }}
                          />
                          <label htmlFor="source-inspection" className="text-xs cursor-pointer">
                            Itens de Vistoria
                          </label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox 
                            id="source-ticket"
                            checked={selectedSources.includes("ticket")}
                            onCheckedChange={(checked) => {
                              if (checked) setSelectedSources(prev => [...prev, "ticket"]);
                              else setSelectedSources(prev => prev.filter(s => s !== "ticket"));
                            }}
                          />
                          <label htmlFor="source-ticket" className="text-xs cursor-pointer">
                            Tickets de Manutenção
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Sections Filter */}
                    <div>
                      <Label className="text-xs font-medium mb-2 block">Seções do Relatório</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: "services", label: "Serviços Pendentes" },
                          { id: "availability", label: "Datas Disponíveis" },
                          { id: "shopping", label: "Lista de Compras" },
                          { id: "alerts", label: "Alertas" },
                        ].map((section) => (
                          <div key={section.id} className="flex items-center gap-2">
                            <Checkbox 
                              id={`section-${section.id}`}
                              checked={showSections.includes(section.id)}
                              onCheckedChange={(checked) => {
                                if (checked) setShowSections(prev => [...prev, section.id]);
                                else setShowSections(prev => prev.filter(s => s !== section.id));
                              }}
                            />
                            <label htmlFor={`section-${section.id}`} className="text-xs cursor-pointer">
                              {section.label}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Generate button */}
                <Button onClick={handleGenerateReport} disabled={generating} className="w-full">
                  {generating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  {generating ? "Gerando..." : "Gerar Relatório"}
                </Button>

                {/* Active filters summary */}
                {(selectedProperties.length > 0 || reportType !== "all" || selectedSources.length < 2 || showSections.length < 4) && (
                  <div className="flex flex-wrap gap-1.5">
                    {reportType !== "all" && (
                      <Badge variant="secondary" className="text-xs">{reportType}</Badge>
                    )}
                    {selectedProperties.length > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {selectedProperties.length} imóvel(is)
                      </Badge>
                    )}
                    {selectedSources.length === 1 && (
                      <Badge variant="secondary" className="text-xs">
                        Só {selectedSources[0] === "inspection" ? "vistorias" : "tickets"}
                      </Badge>
                    )}
                    {showSections.length < 4 && (
                      <Badge variant="secondary" className="text-xs">
                        {showSections.length} seção(ões)
                      </Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Alerts */}
            {showSections.includes("alerts") && alerts.length > 0 && (
              <Card className="border-yellow-200 dark:border-yellow-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 text-yellow-600">
                    <AlertCircle className="h-4 w-4" />
                    Alertas ({alerts.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {alerts.map((alert, i) => (
                    <div key={i} className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-500/5 border border-yellow-200 dark:border-yellow-500/20">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{alert.property_name}</span>
                        <Badge variant="outline" className="text-xs">
                          {alert.deadline ? format(parseISO(alert.deadline), "dd/MM") : ""}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{alert.message}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Service Summaries */}
            {showSections.includes("services") && serviceSummaries.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Resumo por Tipo de Serviço
                </h3>
                {serviceSummaries.map((summary, i) => (
                  <Card key={i}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{summary.service_type}</CardTitle>
                      <CardDescription className="text-xs">
                        {summary.properties.length} unidade(s) com serviços pendentes
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {summary.properties.map((prop, j) => (
                        <div key={j} className="p-3 rounded-lg border bg-muted/30">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <span className="font-medium text-sm">{prop.name}</span>
                              <p className="text-xs text-muted-foreground">{prop.address}</p>
                            </div>
                            <Badge variant={urgencyColor(prop.urgency) as any} className="text-xs">
                              {prop.urgency}
                            </Badge>
                          </div>
                          <div className="space-y-1">
                            {prop.tasks.map((task, k) => (
                              <p key={k} className="text-xs flex items-start gap-1.5">
                                <span className="text-primary mt-0.5">•</span>
                                {task}
                              </p>
                            ))}
                          </div>
                          {prop.available_dates.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {prop.available_dates.map((d, k) => (
                                <Badge key={k} variant="outline" className="text-xs">
                                  {format(parseISO(d.start), "dd/MM")} - {format(parseISO(d.end), "dd/MM")}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {prop.next_guest_checkin && (
                            <p className="text-xs text-yellow-600 mt-1 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Próximo check-in: {format(parseISO(prop.next_guest_checkin), "dd/MM/yyyy")}
                            </p>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Shopping Lists */}
            {showSections.includes("shopping") && shoppingLists.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-primary" />
                  Lista de Compras
                </h3>
                {shoppingLists.map((list, i) => (
                  <Card key={i}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        {list.property_name}
                      </CardTitle>
                      <CardDescription className="text-xs">{list.property_address}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {list.next_checkin && (
                        <p className="text-xs text-yellow-600 mb-2 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Próximo check-in: {format(parseISO(list.next_checkin), "dd/MM/yyyy")}
                        </p>
                      )}
                      <ul className="space-y-1">
                        {list.items.map((item, j) => (
                          <li key={j} className="text-sm flex items-center gap-2">
                            <div className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                      {list.notes && (
                        <p className="text-xs text-muted-foreground mt-2 italic">{list.notes}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Add iCal Dialog */}
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Link iCal</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Unidade *</Label>
                <Select value={newPropertyId} onValueChange={setNewPropertyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a unidade" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>URL do Calendário iCal *</Label>
                <Input
                  placeholder="https://channel-manager.com/calendar.ics"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Cole o link .ics do seu channel manager
                </p>
              </div>
              <div>
                <Label>Fonte</Label>
                <Input
                  placeholder="channel_manager"
                  value={newSourceLabel}
                  onChange={(e) => setNewSourceLabel(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAddLink}>Adicionar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
