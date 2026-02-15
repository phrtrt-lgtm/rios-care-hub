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
import { 
  ArrowLeft, Calendar, Link2, Plus, RefreshCw, Trash2, Building2, 
  Sparkles, ShoppingCart, AlertCircle, Clock, CheckCircle2, Loader2 
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, differenceInDays } from "date-fns";
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

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [linksRes, reservationsRes, propertiesRes] = await Promise.all([
        supabase.from("property_ical_links").select("*, property:property_id(name, address)"),
        supabase.from("reservations").select("*, property:property_id(name, address)").gte("check_out", new Date().toISOString().split("T")[0]).order("check_in"),
        supabase.from("properties").select("id, name, address").order("name"),
      ]);

      setIcalLinks((linksRes.data as any) || []);
      setReservations((reservationsRes.data as any) || []);
      setProperties(propertiesRes.data || []);
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

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
          body: JSON.stringify({ report_type: reportType }),
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
                <CardTitle className="text-base">Gerar Relatório Inteligente</CardTitle>
                <CardDescription className="text-xs">
                  A IA analisa reservas, chamados e vistorias para gerar um resumo por tipo de serviço
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Label className="text-xs">Tipo de Serviço</Label>
                    <Select value={reportType} onValueChange={setReportType}>
                      <SelectTrigger>
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
                  <div className="flex items-end">
                    <Button onClick={handleGenerateReport} disabled={generating}>
                      {generating ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-2" />
                      )}
                      {generating ? "Gerando..." : "Gerar Relatório"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Alerts */}
            {alerts.length > 0 && (
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
            {serviceSummaries.length > 0 && (
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
            {shoppingLists.length > 0 && (
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
