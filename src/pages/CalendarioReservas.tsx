import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { goBack } from "@/lib/navigation";
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
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { 
  ArrowLeft, Calendar, Link2, Plus, RefreshCw, Trash2, Building2, 
  Sparkles, ShoppingCart, AlertCircle, Clock, CheckCircle2, Loader2,
  Wrench, CalendarDays, Filter, SlidersHorizontal, BarChart3, ArrowUpDown, ArrowUp, ArrowDown, BrainCircuit,
  TrendingDown, TrendingUp, Heart, Zap, Shield
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, differenceInDays, addDays, addMonths, eachDayOfInterval, isSameDay, startOfDay, isWithinInterval, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";

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

/** Traduz summaries genéricos do channel manager para texto amigável */
function formatReservationLabel(guest_name: string | null, summary: string | null): string {
  const raw = guest_name || summary || "";
  const lower = raw.toLowerCase();
  // TalkGuest e outros channel managers enviam bloqueios sem nome do hóspede
  if (!raw || lower.includes("unavailable") || lower.includes("blocked") || lower.includes("bloqueado") || lower.includes("not available") || lower.includes("indisponível")) {
    // Tenta extrair a fonte (ex: "TalkGuest - Unavailable" → "TalkGuest")
    const dashIdx = raw.indexOf(" - ");
    if (dashIdx > 0) {
      const source = raw.substring(0, dashIdx).trim();
      return `Reservado (${source})`;
    }
    return "Reservado";
  }
  return raw;
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

  // Calendar view state
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

  // Occupancy analysis state
  type SortField = "name" | "vacant_days" | "occupancy";
  type SortDir = "asc" | "desc";
  const today = new Date();
  const [occStartDate, setOccStartDate] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [occEndDate, setOccEndDate] = useState(format(endOfMonth(today), "yyyy-MM-dd"));
  const [sortField, setSortField] = useState<SortField>("vacant_days");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const setOccPeriod = (months: number) => {
    const start = subMonths(today, months - 1);
    setOccStartDate(format(startOfMonth(start), "yyyy-MM-dd"));
    setOccEndDate(format(endOfMonth(today), "yyyy-MM-dd"));
  };

  const occupancyData = useMemo(() => {
    if (!properties.length) return [];
    const start = parseISO(occStartDate);
    const end = parseISO(occEndDate);
    const totalDays = differenceInDays(end, start) + 1;
    if (totalDays <= 0) return [];
    const allDays = eachDayOfInterval({ start, end });

    return properties.map((property) => {
      const propRes = reservations.filter(r => r.property_id === property.id);
      const occupiedDays = allDays.filter(day =>
        propRes.some(r => {
          const ci = parseISO(r.check_in);
          const co = parseISO(r.check_out);
          return isWithinInterval(day, { start: ci, end: co });
        })
      ).length;
      const vacantDays = totalDays - occupiedDays;
      const occupancyRate = totalDays > 0 ? (occupiedDays / totalDays) * 100 : 0;
      return { property, totalDays, occupiedDays, vacantDays, occupancyRate, reservationCount: propRes.length, hasIcal: propRes.length > 0 };
    });
  }, [properties, reservations, occStartDate, occEndDate]);

  const sortedOccData = useMemo(() => {
    return [...occupancyData].sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") cmp = a.property.name.localeCompare(b.property.name);
      else if (sortField === "vacant_days") cmp = a.vacantDays - b.vacantDays;
      else if (sortField === "occupancy") cmp = a.occupancyRate - b.occupancyRate;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [occupancyData, sortField, sortDir]);

  const occSummary = useMemo(() => {
    const withIcal = occupancyData.filter(d => d.hasIcal);
    const avgOcc = withIcal.length > 0 ? withIcal.reduce((s, d) => s + d.occupancyRate, 0) / withIcal.length : 0;
    const worst = withIcal.length > 0 ? withIcal.reduce((w, d) => d.vacantDays > w.vacantDays ? d : w, withIcal[0]) : null;
    const best = withIcal.length > 0 ? withIcal.reduce((b, d) => d.occupancyRate > b.occupancyRate ? d : b, withIcal[0]) : null;
    return { withIcalCount: withIcal.length, avgOcc, worst, best };
  }, [occupancyData]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir(field === "name" ? "asc" : "desc"); }
  };

  const getOccColor = (rate: number) => rate >= 70 ? "text-green-600" : rate >= 40 ? "text-yellow-600" : "text-red-600";
  const getProgressBg = (rate: number) => rate >= 70 ? "bg-green-500" : rate >= 40 ? "bg-yellow-500" : "bg-red-500";

  // Portfolio health & price alerts data
  const [openTicketsCount, setOpenTicketsCount] = useState<Record<string, number>>({});
  const [pendingInspectionItems, setPendingInspectionItems] = useState<Record<string, number>>({});
  const [openChargesCount, setOpenChargesCount] = useState<Record<string, number>>({});

  useEffect(() => {
    async function fetchHealthData() {
      // Open maintenance tickets per property
      const { data: tickets } = await supabase
        .from("tickets")
        .select("property_id")
        .in("status", ["novo", "em_analise", "em_execucao", "aguardando_info"])
        .not("property_id", "is", null);
      if (tickets) {
        const counts: Record<string, number> = {};
        tickets.forEach(t => { if (t.property_id) counts[t.property_id] = (counts[t.property_id] || 0) + 1; });
        setOpenTicketsCount(counts);
      }

      // Pending inspection items per property (via cleaning_inspections)
      const { data: items } = await supabase
        .from("inspection_items")
        .select("inspection_id, status, cleaning_inspections:inspection_id(property_id)")
        .eq("status", "pending");
      if (items) {
        const counts: Record<string, number> = {};
        items.forEach((item: any) => {
          const pid = item.cleaning_inspections?.property_id;
          if (pid) counts[pid] = (counts[pid] || 0) + 1;
        });
        setPendingInspectionItems(counts);
      }

      // Open charges per property
      const { data: charges } = await supabase
        .from("charges")
        .select("property_id")
        .in("status", ["pending", "overdue"])
        .not("property_id", "is", null);
      if (charges) {
        const counts: Record<string, number> = {};
        charges.forEach(c => { if (c.property_id) counts[c.property_id] = (counts[c.property_id] || 0) + 1; });
        setOpenChargesCount(counts);
      }
    }
    fetchHealthData();
  }, []);

  // Price alerts: properties with <40% occupancy in next 30 days
  const priceAlerts = useMemo(() => {
    if (!properties.length) return [];
    const start = startOfDay(new Date());
    const end30 = addDays(start, 30);
    const end60 = addDays(start, 60);
    const allDays30 = eachDayOfInterval({ start, end: end30 });
    const allDays60 = eachDayOfInterval({ start: addDays(end30, 1), end: end60 });

    return properties.map(property => {
      const propRes = reservations.filter(r => r.property_id === property.id);
      
      const occ30 = allDays30.filter(day => propRes.some(r => isWithinInterval(day, { start: parseISO(r.check_in), end: parseISO(r.check_out) }))).length;
      const occ60 = allDays60.filter(day => propRes.some(r => isWithinInterval(day, { start: parseISO(r.check_in), end: parseISO(r.check_out) }))).length;
      
      const rate30 = (occ30 / allDays30.length) * 100;
      const rate60 = (occ60 / allDays60.length) * 100;

      const alerts: string[] = [];
      let severity: "critical" | "warning" | "ok" = "ok";

      if (rate30 < 20) { alerts.push(`Apenas ${rate30.toFixed(0)}% ocupado nos próx. 30 dias`); severity = "critical"; }
      else if (rate30 < 40) { alerts.push(`${rate30.toFixed(0)}% ocupado nos próx. 30 dias`); severity = "warning"; }

      if (rate60 < 15) { alerts.push(`Apenas ${rate60.toFixed(0)}% ocupado entre 30-60 dias`); severity = severity === "ok" ? "warning" : severity; }

      return { property, rate30, rate60, alerts, severity };
    }).filter(a => a.alerts.length > 0).sort((a, b) => a.rate30 - b.rate30);
  }, [properties, reservations]);

  // Portfolio health score per property
  const healthScores = useMemo(() => {
    return properties.map(property => {
      // Occupancy score (0-40 points) - based on current period occupancy
      const occData = occupancyData.find(d => d.property.id === property.id);
      const occScore = Math.min(40, (occData?.occupancyRate || 0) * 0.4);

      // Maintenance score (0-25 points) - fewer open tickets = better
      const openTickets = openTicketsCount[property.id] || 0;
      const maintScore = Math.max(0, 25 - (openTickets * 8));

      // Inspection score (0-20 points) - fewer pending items = better
      const pendingItems = pendingInspectionItems[property.id] || 0;
      const inspScore = Math.max(0, 20 - (pendingItems * 5));

      // Financial score (0-15 points) - fewer open charges = better
      const openChrg = openChargesCount[property.id] || 0;
      const finScore = Math.max(0, 15 - (openChrg * 5));

      const total = Math.round(occScore + maintScore + inspScore + finScore);

      return {
        property,
        total,
        occupancy: Math.round(occScore),
        maintenance: Math.round(maintScore),
        inspection: Math.round(inspScore),
        financial: Math.round(finScore),
        openTickets,
        pendingItems,
        openCharges: openChrg,
        occupancyRate: occData?.occupancyRate || 0,
      };
    }).sort((a, b) => a.total - b.total);
  }, [properties, occupancyData, openTicketsCount, pendingInspectionItems, openChargesCount]);

  const portfolioAvgScore = useMemo(() => {
    if (!healthScores.length) return 0;
    return Math.round(healthScores.reduce((s, h) => s + h.total, 0) / healthScores.length);
  }, [healthScores]);

  const getHealthColor = (score: number) => score >= 70 ? "text-green-600" : score >= 40 ? "text-yellow-600" : "text-red-600";
  const getHealthBg = (score: number) => score >= 70 ? "bg-green-500" : score >= 40 ? "bg-yellow-500" : "bg-red-500";
  const getHealthLabel = (score: number) => score >= 70 ? "Saudável" : score >= 40 ? "Atenção" : "Crítico";

  const [calendarMonth, setCalendarMonth] = useState(new Date());

  // Report state
  const [serviceSummaries, setServiceSummaries] = useState<ServiceSummary[]>([]);
  const [shoppingLists, setShoppingLists] = useState<ShoppingItem[]>([]);
  const [reportType, setReportType] = useState("all");

  // Report customization
  const [selectedProperties, setSelectedProperties] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>(["inspection", "ticket"]);
  const [showSections, setShowSections] = useState<string[]>(["services", "availability", "shopping"]);
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
    return () => {
      setServiceSummaries([]);
      setShoppingLists([]);
    };
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

  // Properties that have reservations (for the sidebar)
  const propertiesWithReservations = useMemo(() => {
    const propIds = new Set(reservations.map(r => r.property_id));
    return properties.filter(p => propIds.has(p.id));
  }, [reservations, properties]);

  // Calculate reserved days for the selected property
  const selectedReservations = useMemo(() => {
    if (!selectedPropertyId) return reservations;
    return reservations.filter(r => r.property_id === selectedPropertyId);
  }, [selectedPropertyId, reservations]);

  const reservedDays = useMemo(() => {
    const days: Date[] = [];
    selectedReservations.forEach(r => {
      try {
        const interval = eachDayOfInterval({
          start: parseISO(r.check_in),
          end: addDays(parseISO(r.check_out), -1), // check_out day is free
        });
        days.push(...interval);
      } catch { /* skip invalid intervals */ }
    });
    return days;
  }, [selectedReservations]);

  // Find which reservation a clicked date belongs to
  const getReservationForDate = (date: Date) => {
    return selectedReservations.find(r => {
      const checkIn = startOfDay(parseISO(r.check_in));
      const checkOut = startOfDay(parseISO(r.check_out));
      return date >= checkIn && date < checkOut;
    });
  };

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
          <Button variant="ghost" size="icon" onClick={() => goBack(navigate)}>
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
            <TabsTrigger value="occupancy">
              <BarChart3 className="h-4 w-4 mr-2" />
              Ocupação
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
            {propertiesWithReservations.length === 0 && properties.length === 0 ? (
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
              <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
                {/* Property sidebar */}
                <Card className="h-fit">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Imóveis</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 p-3 pt-0">
                    {/* All properties option */}
                    <Button
                      variant={selectedPropertyId === null ? "default" : "ghost"}
                      size="sm"
                      className="w-full justify-start text-xs h-8"
                      onClick={() => setSelectedPropertyId(null)}
                    >
                      <Building2 className="h-3 w-3 mr-2 flex-shrink-0" />
                      Todos os imóveis
                      <Badge variant="secondary" className="ml-auto text-[10px]">
                        {reservations.length}
                      </Badge>
                    </Button>
                    {propertiesWithReservations.map((p) => {
                      const count = reservationsByProperty[p.id]?.length || 0;
                      return (
                        <Button
                          key={p.id}
                          variant={selectedPropertyId === p.id ? "default" : "ghost"}
                          size="sm"
                          className="w-full justify-start text-xs h-8"
                          onClick={() => setSelectedPropertyId(p.id)}
                        >
                          <Building2 className="h-3 w-3 mr-2 flex-shrink-0" />
                          <span className="truncate">{p.name}</span>
                          <Badge variant="secondary" className="ml-auto text-[10px]">
                            {count}
                          </Badge>
                        </Button>
                      );
                    })}
                  </CardContent>
                </Card>

                {/* Calendar + details */}
                <div className="space-y-4">
                  <Card>
                    <CardContent className="p-3">
                      <CalendarComponent
                        mode="single"
                        month={calendarMonth}
                        onMonthChange={setCalendarMonth}
                        numberOfMonths={2}
                        locale={ptBR}
                        className="pointer-events-auto w-full"
                        modifiers={{
                          reserved: reservedDays,
                        }}
                        modifiersClassNames={{
                          reserved: "bg-primary/20 text-primary font-semibold rounded-md",
                        }}
                        classNames={{
                          months: "flex flex-col sm:flex-row gap-4",
                          month: "flex-1",
                        }}
                      />
                    </CardContent>
                  </Card>

                  {/* Selected property reservations list */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-primary" />
                        {selectedPropertyId 
                          ? `Reservas — ${properties.find(p => p.id === selectedPropertyId)?.name}`
                          : "Todas as Reservas"
                        }
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {(selectedPropertyId 
                        ? reservations.filter(r => r.property_id === selectedPropertyId)
                        : reservations
                      ).length === 0 ? (
                        <p className="text-xs text-muted-foreground py-4 text-center">
                          Nenhuma reserva para este imóvel
                        </p>
                      ) : (
                        (selectedPropertyId 
                          ? reservations.filter(r => r.property_id === selectedPropertyId)
                          : reservations
                        ).map((res) => {
                          const daysUntil = differenceInDays(parseISO(res.check_in), new Date());
                          const isActive = daysUntil <= 0 && differenceInDays(parseISO(res.check_out), new Date()) > 0;
                          const prop = properties.find(p => p.id === res.property_id);
                          return (
                            <div
                              key={res.id}
                              className={`flex items-center justify-between p-3 rounded-lg border ${
                                isActive ? "bg-primary/5 border-primary/20" : daysUntil <= 3 && daysUntil >= 0 ? "bg-accent/50 border-accent" : "bg-muted/30"
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
                                    <Badge variant="outline" className="text-xs">Em {daysUntil}d</Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {!selectedPropertyId && prop && (
                                    <span className="font-medium text-foreground mr-1">{prop.name} •</span>
                                  )}
                                  {format(parseISO(res.check_in), "dd MMM", { locale: ptBR })} → {format(parseISO(res.check_out), "dd MMM yyyy", { locale: ptBR })}
                                </p>
                              </div>
                              <div className="text-right text-xs text-muted-foreground">
                                {differenceInDays(parseISO(res.check_out), parseISO(res.check_in))} noites
                              </div>
                            </div>
                          );
                        })
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
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
                      {ps.available_windows.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            Próximas janelas disponíveis
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {ps.available_windows.map((w, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
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
                {(selectedProperties.length > 0 || reportType !== "all" || selectedSources.length < 2 || showSections.length < 3) && (
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
                    {showSections.length < 3 && (
                      <Badge variant="secondary" className="text-xs">
                        {showSections.length} seção(ões)
                      </Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

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

          {/* Occupancy Tab */}
          <TabsContent value="occupancy" className="space-y-4">
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">Período de Análise</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setOccStartDate(format(startOfMonth(today), "yyyy-MM-dd")); setOccEndDate(format(endOfMonth(today), "yyyy-MM-dd")); }}>Este mês</Button>
                  <Button size="sm" variant="outline" onClick={() => setOccPeriod(3)}>3 meses</Button>
                  <Button size="sm" variant="outline" onClick={() => setOccPeriod(6)}>6 meses</Button>
                  <Button size="sm" variant="outline" onClick={() => setOccPeriod(12)}>12 meses</Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Início</Label>
                    <Input type="date" value={occStartDate} onChange={(e) => setOccStartDate(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fim</Label>
                    <Input type="date" value={occEndDate} onChange={(e) => setOccEndDate(e.target.value)} className="h-9" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="py-3 px-4">
                  <p className="text-xs text-muted-foreground">Imóveis c/ iCal</p>
                  <p className="text-2xl font-bold">{occSummary.withIcalCount}</p>
                  <p className="text-xs text-muted-foreground">de {properties.length}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-yellow-500">
                <CardContent className="py-3 px-4">
                  <p className="text-xs text-muted-foreground">Ocupação Média</p>
                  <p className={`text-2xl font-bold ${getOccColor(occSummary.avgOcc)}`}>{occSummary.avgOcc.toFixed(0)}%</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-green-500">
                <CardContent className="py-3 px-4">
                  <p className="text-xs text-muted-foreground">Melhor Imóvel</p>
                  <p className="text-sm font-bold truncate">{occSummary.best?.property.name || "-"}</p>
                  <p className="text-xs text-green-600">{occSummary.best?.occupancyRate.toFixed(0)}% ocupado</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-red-500">
                <CardContent className="py-3 px-4">
                  <p className="text-xs text-muted-foreground">Mais Vago</p>
                  <p className="text-sm font-bold truncate">{occSummary.worst?.property.name || "-"}</p>
                  <p className="text-xs text-red-600">{occSummary.worst?.vacantDays || 0} dias vagos</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Dias Vagos por Imóvel</CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {differenceInDays(parseISO(occEndDate), parseISO(occStartDate)) + 1} dias no período
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-3">
                          <button className="flex items-center gap-1 font-medium" onClick={() => toggleSort("name")}>
                            Imóvel
                            {sortField === "name" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground" />}
                          </button>
                        </th>
                        <th className="text-center p-3">
                          <button className="flex items-center gap-1 font-medium mx-auto" onClick={() => toggleSort("occupancy")}>
                            Ocupação
                            {sortField === "occupancy" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground" />}
                          </button>
                        </th>
                        <th className="text-center p-3">
                          <button className="flex items-center gap-1 font-medium mx-auto" onClick={() => toggleSort("vacant_days")}>
                            Dias Vagos
                            {sortField === "vacant_days" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground" />}
                          </button>
                        </th>
                        <th className="text-center p-3 hidden sm:table-cell">Reservas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedOccData.map((item) => (
                        <tr key={item.property.id} className="border-t hover:bg-accent/50 transition-colors">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="font-medium truncate">{item.property.name}</span>
                              {!item.hasIcal && <Badge variant="outline" className="text-[10px] shrink-0">Sem iCal</Badge>}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex flex-col items-center gap-1">
                              <span className={`text-sm font-bold ${getOccColor(item.occupancyRate)}`}>{item.occupancyRate.toFixed(0)}%</span>
                              <div className="w-full max-w-[80px] h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${getProgressBg(item.occupancyRate)}`} style={{ width: `${item.occupancyRate}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`font-bold ${item.vacantDays > item.totalDays * 0.5 ? "text-red-600" : "text-foreground"}`}>{item.vacantDays}</span>
                            <span className="text-muted-foreground text-xs">/{item.totalDays}</span>
                          </td>
                          <td className="p-3 text-center hidden sm:table-cell text-muted-foreground">{item.reservationCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Smart Price Alerts */}
            {priceAlerts.length > 0 && (
              <Card className="border-orange-200 dark:border-orange-800">
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-orange-500" />
                    <CardTitle className="text-sm">Alertas de Preço</CardTitle>
                    <Badge variant="destructive" className="text-xs ml-auto">{priceAlerts.length}</Badge>
                  </div>
                  <CardDescription className="text-xs">Imóveis com baixa ocupação futura — considere ajustar preços</CardDescription>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  {priceAlerts.map((alert) => (
                    <div
                      key={alert.property.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border ${
                        alert.severity === "critical" ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30" : "border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30"
                      }`}
                    >
                      <TrendingDown className={`h-4 w-4 mt-0.5 shrink-0 ${alert.severity === "critical" ? "text-red-500" : "text-yellow-500"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{alert.property.name}</p>
                        {alert.alerts.map((msg, i) => (
                          <p key={i} className="text-xs text-muted-foreground">{msg}</p>
                        ))}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">30d</p>
                        <p className={`text-sm font-bold ${getOccColor(alert.rate30)}`}>{alert.rate30.toFixed(0)}%</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Portfolio Health Score */}
            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <Heart className="h-5 w-5 text-primary" />
                  <CardTitle className="text-sm">Saúde do Portfólio</CardTitle>
                  <div className="ml-auto flex items-center gap-2">
                    <span className={`text-2xl font-bold ${getHealthColor(portfolioAvgScore)}`}>{portfolioAvgScore}</span>
                    <span className="text-xs text-muted-foreground">/100</span>
                  </div>
                </div>
                <CardDescription className="text-xs">
                  Score baseado em ocupação (40pts), manutenções (25pts), vistorias (20pts) e financeiro (15pts)
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="space-y-3">
                  {healthScores.map((item) => (
                    <div key={item.property.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium truncate">{item.property.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className={`text-xs ${getHealthColor(item.total)}`}>
                            {getHealthLabel(item.total)}
                          </Badge>
                          <span className={`text-lg font-bold ${getHealthColor(item.total)}`}>{item.total}</span>
                        </div>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${getHealthBg(item.total)}`} style={{ width: `${item.total}%` }} />
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div>
                          <p className="text-[10px] text-muted-foreground">Ocupação</p>
                          <p className="text-xs font-medium">{item.occupancy}/40</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">Manutenção</p>
                          <p className="text-xs font-medium">{item.maintenance}/25</p>
                          {item.openTickets > 0 && <p className="text-[10px] text-red-500">{item.openTickets} abertas</p>}
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">Vistoria</p>
                          <p className="text-xs font-medium">{item.inspection}/20</p>
                          {item.pendingItems > 0 && <p className="text-[10px] text-red-500">{item.pendingItems} pendentes</p>}
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">Financeiro</p>
                          <p className="text-xs font-medium">{item.financial}/15</p>
                          {item.openCharges > 0 && <p className="text-[10px] text-red-500">{item.openCharges} cobranças</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
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
