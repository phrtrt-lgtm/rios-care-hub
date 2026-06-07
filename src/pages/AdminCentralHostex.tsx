import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { RefreshCw, TrendingUp, Calendar, BarChart3, AlertTriangle, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  pricingInsights30d,
  revenuePace30d,
  weekendOccupancy30d,
  type PropertyPricingInsight,
} from "@/lib/hostexInsights";
import {
  channelMix,
  occupancyRate,
  averageLeadTime,
  forecastRevenue,
} from "@/lib/occupancyMetrics";
import { formatBRL, formatChannelLabel, type HostexReservation } from "@/lib/hostex";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface SyncLog {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  reservations_upserted: number;
  properties_upserted: number;
  reservations_cancelled: number;
  error_message: string | null;
  triggered_by: string | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "agora";
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

const actionLabels: Record<PropertyPricingInsight["action"], { label: string; variant: any }> = {
  subir_preco: { label: "Subir preço", variant: "default" },
  descontar_gap: { label: "Desconto p/ gap", variant: "destructive" },
  preencher_curto: { label: "Promo fim de semana", variant: "secondary" },
  manter: { label: "Manter", variant: "outline" },
};

export default function AdminCentralHostex() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [reservations, setReservations] = useState<HostexReservation[]>([]);
  const [properties, setProperties] = useState<Array<{ id: string; name: string }>>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [source, setSource] = useState<string>("");

  async function load() {
    setLoading(true);
    try {
      const today = new Date();
      const start = new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10);
      const end = new Date(today.getTime() + 90 * 86400000).toISOString().slice(0, 10);

      const [resResp, propResp, logsResp] = await Promise.all([
        supabase.functions.invoke("hostex-proxy", {
          body: { action: "search_reservations", params: { start_date: start, end_date: end } },
        }),
        supabase.functions.invoke("hostex-proxy", {
          body: { action: "search_properties", params: {} },
        }),
        supabase
          .from("hostex_sync_log")
          .select("*")
          .order("started_at", { ascending: false })
          .limit(20),
      ]);

      const rData: any = resResp.data;
      const pData: any = propResp.data;
      const list: HostexReservation[] =
        rData?.data?.reservations ?? rData?.data?.data?.reservations ?? [];
      const props: any[] =
        pData?.data?.properties ?? pData?.data?.data?.properties ?? [];

      setReservations(list);
      setProperties(props.map((p) => ({ id: String(p.id), name: p.name })));
      setSyncLogs((logsResp.data as SyncLog[]) || []);
      setLastSync(rData?.synced_at ?? null);
      setSource(rData?.source ?? "");
    } catch (e: any) {
      toast({ title: "Erro ao carregar dados Hostex", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function triggerSync() {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("hostex-sync", {
        body: { force: true },
      });
      if (error) throw error;
      toast({
        title: "Sincronização concluída",
        description: `${(data as any)?.reservations_upserted ?? 0} reservas atualizadas.`,
      });
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao sincronizar", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }

  const today = new Date();
  const start30 = today.toISOString().slice(0, 10);
  const end30 = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);

  const insights = useMemo(
    () => pricingInsights30d(reservations, properties, today),
    [reservations, properties],
  );
  const pace = useMemo(() => revenuePace30d(reservations, today), [reservations]);
  const mix = useMemo(() => channelMix(reservations), [reservations]);
  const occ = useMemo(
    () => occupancyRate(reservations, properties.map((p) => p.id), start30, end30),
    [reservations, properties, start30, end30],
  );
  const lead = useMemo(() => averageLeadTime(reservations), [reservations]);
  const fcst = useMemo(() => forecastRevenue(reservations, start30, end30), [reservations, start30, end30]);
  const wk = useMemo(() => weekendOccupancy30d(reservations, properties.length, today), [reservations, properties.length]);

  function exportInsightsCsv() {
    const header = ["Imóvel", "Ocupação 30d %", "Vagos 30d", "Vagos fim de semana", "Maior gap", "ADR (R$)", "Receita 30d (R$)", "Ação", "Justificativa"];
    const rows = insights.map((i) => [
      i.property_name,
      (i.occupancy_30d * 100).toFixed(1),
      i.vacant_nights_30d,
      i.vacant_weekend_nights_30d,
      i.longest_gap_nights,
      i.adr_next_30d.toFixed(2),
      i.revenue_next_30d.toFixed(2),
      actionLabels[i.action].label,
      i.rationale,
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `central-hostex-insights-${start30}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="container max-w-7xl py-6 space-y-4">
        <SectionSkeleton />
      </div>
    );
  }

  return (
    <div className="container max-w-7xl py-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Central Hostex
          </h1>
          <p className="text-sm text-muted-foreground">
            Reservas, ocupação e insights de preço — sincronizado a cada 6h
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={source === "hostex_live" ? "default" : source.includes("stale") ? "destructive" : "secondary"}>
            {source === "hostex_live" && "Hostex (ao vivo)"}
            {source === "hostex_cache" && `Cache Hostex • ${timeAgo(lastSync)}`}
            {source === "hostex_cache_stale" && `Cache desatualizado • ${timeAgo(lastSync)}`}
            {source === "ical_fallback" && "iCal (fallback)"}
            {!source && "Sem dados"}
          </Badge>
          <Button onClick={triggerSync} disabled={syncing} size="sm" variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            Sincronizar agora
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ocupação próximos 30d</CardDescription>
            <CardTitle className="text-3xl">{(occ.portfolio.occupancy_rate * 100).toFixed(0)}%</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {occ.portfolio.nights_booked} de {occ.portfolio.nights_available} noites
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Receita prevista 30d</CardDescription>
            <CardTitle className="text-3xl">{formatBRL(fcst)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            ADR portfólio: {formatBRL(occ.portfolio.nights_booked > 0 ? occ.portfolio.revenue / occ.portfolio.nights_booked : 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Lead time médio</CardDescription>
            <CardTitle className="text-3xl">{lead.toFixed(0)}d</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Da reserva ao check-in
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Fim de semana 30d</CardDescription>
            <CardTitle className="text-3xl">{(wk.rate * 100).toFixed(0)}%</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {wk.weekend_booked} / {wk.weekend_slots} noites
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="insights" className="space-y-4">
        <TabsList>
          <TabsTrigger value="insights"><TrendingUp className="h-4 w-4 mr-2" />Insights 30d</TabsTrigger>
          <TabsTrigger value="pace"><BarChart3 className="h-4 w-4 mr-2" />Pacing & canais</TabsTrigger>
          <TabsTrigger value="reservations"><Calendar className="h-4 w-4 mr-2" />Reservas</TabsTrigger>
          <TabsTrigger value="logs"><AlertTriangle className="h-4 w-4 mr-2" />Log sync</TabsTrigger>
        </TabsList>

        <TabsContent value="insights" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Recomendações automáticas por imóvel para os próximos 30 dias.</p>
            <Button size="sm" variant="outline" onClick={exportInsightsCsv}>Exportar CSV</Button>
          </div>
          {insights.length === 0 ? (
            <EmptyState icon={<TrendingUp className="h-8 w-8" />} title="Sem dados de insights" description="Sincronize a Hostex para gerar insights." />
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Imóvel</TableHead>
                      <TableHead className="text-right">Ocup. 30d</TableHead>
                      <TableHead className="text-right">Vagos</TableHead>
                      <TableHead className="text-right">Fds vagos</TableHead>
                      <TableHead className="text-right">Maior gap</TableHead>
                      <TableHead className="text-right">ADR</TableHead>
                      <TableHead className="text-right">Receita 30d</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead>Justificativa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {insights
                      .sort((a, b) => b.longest_gap_nights - a.longest_gap_nights)
                      .map((i) => (
                        <TableRow key={i.property_id}>
                          <TableCell className="font-medium">{i.property_name}</TableCell>
                          <TableCell className="text-right">{(i.occupancy_30d * 100).toFixed(0)}%</TableCell>
                          <TableCell className="text-right">{i.vacant_nights_30d}</TableCell>
                          <TableCell className="text-right">{i.vacant_weekend_nights_30d}</TableCell>
                          <TableCell className="text-right">{i.longest_gap_nights}</TableCell>
                          <TableCell className="text-right">{formatBRL(i.adr_next_30d)}</TableCell>
                          <TableCell className="text-right">{formatBRL(i.revenue_next_30d)}</TableCell>
                          <TableCell>
                            <Badge variant={actionLabels[i.action].variant}>{actionLabels[i.action].label}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-xs">{i.rationale}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="pace" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Receita acumulada (30d)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={pace}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={11} />
                    <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} fontSize={11} />
                    <Tooltip formatter={(v: any) => formatBRL(v)} />
                    <Line type="monotone" dataKey="cumulative_revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Mix de canais</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={mix.map((c) => ({ ...c, channel: formatChannelLabel(c.channel) }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="channel" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip formatter={(v: any) => formatBRL(v)} />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="reservations" className="space-y-4">
          {reservations.length === 0 ? (
            <EmptyState icon={<Calendar className="h-8 w-8" />} title="Nenhuma reserva" description="Sincronize a Hostex." />
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Check-in</TableHead>
                      <TableHead>Check-out</TableHead>
                      <TableHead>Imóvel</TableHead>
                      <TableHead>Canal</TableHead>
                      <TableHead>Hóspede</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reservations
                      .slice()
                      .sort((a, b) => a.check_in_date.localeCompare(b.check_in_date))
                      .slice(0, 200)
                      .map((r) => (
                        <TableRow key={r.reservation_code}>
                          <TableCell>{r.check_in_date}</TableCell>
                          <TableCell>{r.check_out_date}</TableCell>
                          <TableCell>{r.property_name ?? r.property_id}</TableCell>
                          <TableCell><Badge variant="outline">{formatChannelLabel(r.channel_type)}</Badge></TableCell>
                          <TableCell>{r.guest_name ?? "—"}</TableCell>
                          <TableCell className="text-right">{formatBRL(r.rates?.total_rate?.amount)}</TableCell>
                          <TableCell><Badge variant="secondary">{r.status ?? "—"}</Badge></TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          {syncLogs.length === 0 ? (
            <EmptyState icon={<AlertTriangle className="h-8 w-8" />} title="Sem sincronizações registradas" description="Clique em 'Sincronizar agora' para começar." />
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Início</TableHead>
                      <TableHead>Duração</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead className="text-right">Reservas</TableHead>
                      <TableHead className="text-right">Imóveis</TableHead>
                      <TableHead className="text-right">Cancel.</TableHead>
                      <TableHead>Erro</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {syncLogs.map((l) => {
                      const dur = l.finished_at
                        ? `${((new Date(l.finished_at).getTime() - new Date(l.started_at).getTime()) / 1000).toFixed(1)}s`
                        : "…";
                      return (
                        <TableRow key={l.id}>
                          <TableCell className="text-xs">{new Date(l.started_at).toLocaleString("pt-BR")}</TableCell>
                          <TableCell>{dur}</TableCell>
                          <TableCell>
                            <Badge variant={l.status === "ok" ? "default" : l.status === "running" ? "secondary" : "destructive"}>
                              {l.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{l.triggered_by ?? "—"}</TableCell>
                          <TableCell className="text-right">{l.reservations_upserted}</TableCell>
                          <TableCell className="text-right">{l.properties_upserted}</TableCell>
                          <TableCell className="text-right">{l.reservations_cancelled}</TableCell>
                          <TableCell className="text-xs text-destructive max-w-xs truncate">{l.error_message ?? ""}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
