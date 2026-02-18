import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMaintenances, useMaintenanceCharts } from "@/hooks/useMaintenances";
import { MaintenanceCharts } from "@/components/MaintenanceCharts";
import { MaintenanceSummaryCards } from "@/components/MaintenanceSummaryCards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL, formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Plus, Filter, Building2, ArrowLeft } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { goBack } from "@/lib/navigation";
import { supabase } from "@/integrations/supabase/client";

export default function Manutencoes() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>("");
  const [activeFilters, setActiveFilters] = useState({ status: "", search: "", serviceType: "" });
  const [serviceTypeData, setServiceTypeData] = useState<any[]>([]);
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(searchParams.get('property') || "");

  const isOwner = profile?.role === 'owner';
  const isTeam = profile?.role === 'admin' || profile?.role === 'agent' || profile?.role === 'maintenance';
  const ownerId = isOwner ? profile?.id : undefined;
  const propertyId = selectedPropertyId || undefined;

  const { data: maintenances, isLoading } = useMaintenances({
    ownerId,
    propertyId,
    status: activeFilters.status || undefined,
    search: activeFilters.search || undefined,
  });
  const { data: charts } = useMaintenanceCharts(ownerId, year, propertyId);

  // Fetch properties for team filter
  useEffect(() => {
    if (isTeam) {
      supabase.from('properties').select('id, name, owner:profiles!properties_owner_id_fkey(name)').order('name')
        .then(({ data }) => setProperties(data || []));
    }
  }, [isTeam]);

  useEffect(() => {
    if (user) {
      fetchServiceTypeData();
    }
  }, [user, year, propertyId]);

  const fetchServiceTypeData = async () => {
    try {
      let query = supabase
        .from('charges')
        .select('service_type, amount_cents')
        .is('archived_at', null)
        .not('service_type', 'is', null) as any;

      if (ownerId) {
        query = query.eq('owner_id', ownerId);
      }

      if (propertyId) {
        query = query.eq('property_id', propertyId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const grouped = (data || []).reduce((acc: any, charge: any) => {
        const type = charge.service_type || 'Outros';
        if (!acc[type]) {
          acc[type] = { service_type: type, total_amount: 0, charge_count: 0 };
        }
        acc[type].total_amount += charge.amount_cents;
        acc[type].charge_count += 1;
        return acc;
      }, {});

      const groupedData = Object.values(grouped);
      setServiceTypeData(groupedData);
      setServiceTypes(groupedData.map((d: any) => d.service_type));
    } catch (error) {
      console.error('Erro ao carregar dados de tipo de serviço:', error);
    }
  };

  // Summary computed from maintenances
  const summary = useMemo(() => {
    if (!maintenances) return null;
    const yearData = maintenances.filter((m: any) => new Date(m.created_at).getFullYear() === year);
    const openCount = yearData.filter((m: any) => ['draft', 'pending'].includes(m.status)).length;
    const completedCount = yearData.filter((m: any) => m.status === 'paid').length;
    const paidCount = completedCount;
    const totalCents = yearData.reduce((sum: number, m: any) => sum + ((m.amount_cents || 0) - (m.management_contribution_cents || 0)), 0);
    const avgOrderCents = yearData.length > 0 ? totalCents / yearData.length : 0;
    return { openCount, completedCount, paidCount, totalCents, avgOrderCents };
  }, [maintenances, year]);

  // Per-property summaries for team overview
  const propertyReports = useMemo(() => {
    if (!isTeam || !maintenances || selectedPropertyId) return [];
    const yearData = maintenances.filter((m: any) => new Date(m.created_at).getFullYear() === year);
    const byProperty: Record<string, { name: string; ownerName: string; items: any[] }> = {};
    yearData.forEach((m: any) => {
      const pid = m.property_id || 'sem-imovel';
      if (!byProperty[pid]) {
        byProperty[pid] = {
          name: m.property?.name || 'Sem imóvel',
          ownerName: m.owner?.name || '-',
          items: [],
        };
      }
      byProperty[pid].items.push(m);
    });
    return Object.entries(byProperty).map(([id, data]) => {
      const totalCents = data.items.reduce((s: number, m: any) => s + (m.amount_cents || 0), 0);
      const openCount = data.items.filter((m: any) => ['draft', 'pending'].includes(m.status)).length;
      const paidCount = data.items.filter((m: any) => m.status === 'paid').length;
      return { id, ...data, totalCents, openCount, paidCount, count: data.items.length };
    }).sort((a, b) => b.totalCents - a.totalCents);
  }, [isTeam, maintenances, year, selectedPropertyId]);

  const handleFilter = () => {
    setActiveFilters({ status, search, serviceType: serviceTypeFilter });
  };

  const handlePropertyChange = (value: string) => {
    const pid = value === "all" ? "" : value;
    setSelectedPropertyId(pid);
    if (pid) {
      setSearchParams({ property: pid });
    } else {
      setSearchParams({});
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      draft: { variant: "secondary", label: "Rascunho" },
      pending: { variant: "default", label: "Pendente" },
      paid: { variant: "default", label: "Paga" },
      contested: { variant: "destructive", label: "Contestada" },
      debited: { variant: "outline", label: "Debitada" },
      cancelled: { variant: "destructive", label: "Cancelada" },
    };
    const config = variants[status] || { variant: "secondary", label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getResponsibleLabel = (responsible: string, percent?: number | null) => {
    if (responsible === 'owner') return 'Proprietário';
    if (responsible === 'management') return 'Gestão';
    if (responsible === 'split') return `Dividido (${percent}% prop.)`;
    return responsible;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/painel')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-bold">Manutenções</h1>
        </div>
        {isOwner && (
          <Button onClick={() => navigate('/novo-manutencao')}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Manutenção
          </Button>
        )}
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3 items-end">
            {isTeam && (
              <div className="space-y-2 w-56">
                <label className="text-sm font-medium flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  Unidade
                </label>
                <Select value={selectedPropertyId || "all"} onValueChange={handlePropertyChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as unidades</SelectItem>
                    {properties.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} {p.owner?.name ? `(${p.owner.name})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2 w-32">
              <label className="text-sm font-medium">Ano</label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[year, year - 1, year - 2].map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 w-48">
              <label className="text-sm font-medium">Status</label>
              <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="paid">Paga</SelectItem>
                  <SelectItem value="contested">Contestada</SelectItem>
                  <SelectItem value="debited">Debitada</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {serviceTypes.length > 0 && (
              <div className="space-y-2 w-48">
                <label className="text-sm font-medium flex items-center gap-1">
                  <Filter className="h-3 w-3" />
                  Tipo de Serviço
                </label>
                <Select value={serviceTypeFilter || "all"} onValueChange={(v) => setServiceTypeFilter(v === "all" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os tipos</SelectItem>
                    {serviceTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2 flex-1 min-w-[200px]">
              <label className="text-sm font-medium">Buscar</label>
              <Input
                placeholder="Título ou descrição..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
              />
            </div>

            <Button onClick={handleFilter}>Filtrar</Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary + Charts */}
      <MaintenanceSummaryCards summary={summary} />
      <MaintenanceCharts charts={charts} serviceTypeData={serviceTypeData} />

      {/* Lista de Manutenções */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lista de Manutenções</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3">Data</th>
                  <th className="text-left p-3">Imóvel</th>
                  <th className="text-left p-3">Título / Categoria</th>
                  <th className="text-right p-3">Valor Total</th>
                  <th className="text-right p-3">Aporte Gestão</th>
                  <th className="text-right p-3">Valor Devido</th>
                  <th className="text-center p-3">Responsável</th>
                  <th className="text-right p-3">Pago</th>
                  <th className="text-center p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="text-center p-8 text-muted-foreground">
                      Carregando...
                    </td>
                  </tr>
                ) : maintenances && maintenances.length > 0 ? (
                  maintenances
                    .filter((m: any) => !activeFilters.serviceType || m.service_type === activeFilters.serviceType)
                    .map((m: any) => (
                    <tr
                      key={m.id}
                      className="border-t hover:bg-accent cursor-pointer transition-colors"
                      onClick={() => navigate(`/cobranca/${m.id}`)}
                    >
                      <td className="p-3">{formatDateTime(m.created_at)}</td>
                      <td className="p-3">{m.property?.name || '-'}</td>
                      <td className="p-3">
                        <div className="font-medium">{m.title}</div>
                        {m.category && (
                          <div className="text-xs text-muted-foreground">{m.category}</div>
                        )}
                        {m.service_type && (
                          <div className="text-xs text-muted-foreground">🏷️ {m.service_type}</div>
                        )}
                      </td>
                      <td className="p-3 text-right font-medium">
                        {formatBRL(m.amount_cents)}
                      </td>
                      <td className="p-3 text-right font-medium text-emerald-600">
                        {m.management_contribution_cents > 0 ? formatBRL(m.management_contribution_cents) : '-'}
                      </td>
                      <td className="p-3 text-right font-bold">
                        {formatBRL(m.amount_cents - (m.management_contribution_cents || 0))}
                      </td>
                      <td className="p-3 text-center text-xs">
                        {getResponsibleLabel(m.cost_responsible, m.split_owner_percent)}
                      </td>
                      <td className="p-3 text-right">
                        {formatBRL(m.paid_cents)}
                      </td>
                      <td className="p-3 text-center">{getStatusBadge(m.status)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="text-center p-8 text-muted-foreground">
                      Nenhuma manutenção encontrada
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Por Unidade - Team only */}
      {isTeam && !selectedPropertyId && propertyReports.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Resumo por Unidade</h2>
          {propertyReports.map((prop) => (
            <Card key={prop.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      {prop.name}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Proprietário: {prop.ownerName}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePropertyChange(prop.id)}
                  >
                    Ver detalhes
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">Total Gasto</div>
                    <div className="text-lg font-bold">{formatBRL(prop.totalCents)}</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">Manutenções</div>
                    <div className="text-lg font-bold">{prop.count}</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">Abertas</div>
                    <div className="text-lg font-bold text-orange-600">{prop.openCount}</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">Pagas</div>
                    <div className="text-lg font-bold text-emerald-600">{prop.paidCount}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
