import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMaintenances, useMaintenanceSummary, useMaintenanceCharts } from "@/hooks/useMaintenances";
import { MaintenanceSummaryCards } from "@/components/MaintenanceSummaryCards";
import { MaintenanceCharts } from "@/components/MaintenanceCharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL, formatDateTime, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, Plus, Filter } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export default function Manutencoes() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>("");
  const [activeFilters, setActiveFilters] = useState({ status: "", search: "", serviceType: "" });
  const [serviceTypeData, setServiceTypeData] = useState<any[]>([]);
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);

  const isOwner = profile?.role === 'owner';
  const ownerId = isOwner ? profile?.id : undefined;

  const { data: summary } = useMaintenanceSummary(ownerId, year);
  const { data: maintenances, isLoading } = useMaintenances({
    ownerId,
    status: activeFilters.status || undefined,
    search: activeFilters.search || undefined,
  });
  const { data: charts } = useMaintenanceCharts(ownerId, year);

  useEffect(() => {
    if (user) {
      fetchServiceTypeData();
    }
  }, [user, year]);

  const fetchServiceTypeData = async () => {
    try {
      const query = supabase
        .from('charges')
        .select('service_type, amount_cents')
        .not('service_type', 'is', null) as any;

      if (ownerId) {
        query.eq('owner_id', ownerId);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Group by service type and calculate totals
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

  const handleFilter = () => {
    setActiveFilters({ status, search, serviceType: serviceTypeFilter });
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
        <h1 className="text-3xl font-bold">Manutenções</h1>
        {isOwner && (
          <Button onClick={() => navigate('/novo-manutencao')}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Manutenção
          </Button>
        )}
      </div>

      {/* Cards resumo */}
      <MaintenanceSummaryCards summary={summary || null} />

      {/* Próximos pagamentos */}
      {summary?.nextPayments && summary.nextPayments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              Próximos Pagamentos (30 dias)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {summary.nextPayments.map((payment: any) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between border rounded-lg p-3 hover:bg-accent cursor-pointer transition-colors"
                  onClick={() => navigate(`/manutencao/${payment.id}`)}
                >
                  <div className="flex-1 truncate">
                    <div className="font-medium">{payment.title}</div>
                  </div>
                  <div className="text-sm text-muted-foreground mx-4">
                    {formatDate(payment.due_at)}
                  </div>
                  <div className="font-medium">{formatBRL(payment.cost_total_cents)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gráficos */}
      <MaintenanceCharts charts={charts} serviceTypeData={serviceTypeData} />

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3 items-end">
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

      {/* Lista de manutenções */}
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
                      onClick={() => navigate(`/manutencao/${m.id}`)}
                    >
                      <td className="p-3">{formatDateTime(m.created_at)}</td>
                      <td className="p-3">{m.property?.name || '-'}</td>
                      <td className="p-3">
                        <div className="font-medium">{m.title}</div>
                        {m.category && (
                          <div className="text-xs text-muted-foreground">{m.category}</div>
                        )}
                        {m.service_type && (
                          <div className="text-xs text-purple-600">🏷️ {m.service_type}</div>
                        )}
                      </td>
                      <td className="p-3 text-right font-medium">
                        {formatBRL(m.amount_cents)}
                      </td>
                      <td className="p-3 text-right text-green-600 font-medium">
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
    </div>
  );
}
