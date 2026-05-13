import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useMaintenances, useMaintenanceCharts } from "@/hooks/useMaintenances";
import { MaintenanceCharts } from "@/components/MaintenanceCharts";
import { MaintenanceSummaryCards } from "@/components/MaintenanceSummaryCards";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  ChevronRight,
  Building2,
  Mail,
  Phone,
  Wrench,
  ArrowUpDown,
} from "lucide-react";
import { formatBRL, formatDateTime } from "@/lib/format";

interface OwnerProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  photo_url: string | null;
}

export default function AdminRelatorioManutencoesProprietario() {
  const { ownerId } = useParams<{ ownerId: string }>();
  const navigate = useNavigate();

  const [owner, setOwner] = useState<OwnerProfile | null>(null);
  const [loadingOwner, setLoadingOwner] = useState(true);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [propertyId, setPropertyId] = useState<string>("");
  const [properties, setProperties] = useState<any[]>([]);

  useEffect(() => {
    if (!ownerId) return;
    (async () => {
      try {
        const [{ data: profileData }, { data: propsData }] = await Promise.all([
          supabase
            .from("profiles")
            .select("id, name, email, phone, photo_url")
            .eq("id", ownerId)
            .single(),
          supabase
            .from("properties")
            .select("id, name")
            .eq("owner_id", ownerId)
            .is("archived_at", null)
            .order("name"),
        ]);
        setOwner(profileData as OwnerProfile);
        setProperties(propsData || []);
      } catch (err) {
        console.error("Erro ao carregar proprietário:", err);
      } finally {
        setLoadingOwner(false);
      }
    })();
  }, [ownerId]);

  const { data: maintenances, isLoading } = useMaintenances({
    ownerId,
    propertyId: propertyId || undefined,
  });
  const { data: charts } = useMaintenanceCharts(ownerId, year, propertyId || undefined);

  const summary = useMemo(() => {
    if (!maintenances) return null;
    const yearData = maintenances.filter(
      (m: any) => new Date(m.created_at).getFullYear() === year,
    );
    const openCount = yearData.filter((m: any) =>
      ["draft", "pending", "sent"].includes(m.status),
    ).length;
    const completedCount = yearData.filter((m: any) =>
      ["pago_no_vencimento", "pago_antecipado", "pago_com_atraso", "paid"].includes(m.status),
    ).length;
    const totalCents = yearData.reduce(
      (sum: number, m: any) =>
        sum + ((m.amount_cents || 0) - (m.management_contribution_cents || 0)),
      0,
    );
    const avgOrderCents = yearData.length > 0 ? totalCents / yearData.length : 0;
    return {
      openCount,
      completedCount,
      paidCount: completedCount,
      totalCents,
      avgOrderCents,
    };
  }, [maintenances, year]);

  const serviceTypeData = useMemo(() => {
    if (!maintenances) return [];
    const grouped: Record<string, { service_type: string; total_amount: number; charge_count: number }> = {};
    maintenances
      .filter((m: any) => new Date(m.created_at).getFullYear() === year && m.service_type)
      .forEach((m: any) => {
        const type = m.service_type || "Outros";
        if (!grouped[type]) grouped[type] = { service_type: type, total_amount: 0, charge_count: 0 };
        grouped[type].total_amount += m.amount_cents || 0;
        grouped[type].charge_count += 1;
      });
    return Object.values(grouped);
  }, [maintenances, year]);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      draft: { variant: "secondary", label: "Rascunho" },
      pending: { variant: "default", label: "Pendente" },
      sent: { variant: "default", label: "Enviada" },
      paid: { variant: "default", label: "Paga" },
      pago_no_vencimento: { variant: "default", label: "Paga" },
      pago_antecipado: { variant: "default", label: "Paga (antecipada)" },
      pago_com_atraso: { variant: "default", label: "Paga (atraso)" },
      contested: { variant: "destructive", label: "Contestada" },
      debited: { variant: "outline", label: "Debitada" },
      cancelled: { variant: "destructive", label: "Cancelada" },
    };
    const config = variants[status] || { variant: "secondary", label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (loadingOwner) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <div className="container mx-auto px-4 py-6 space-y-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!owner) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-muted-foreground">Proprietário não encontrado.</p>
        <Button variant="outline" onClick={() => navigate("/admin/relatorios-manutencoes")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>
    );
  }

  const filteredYearMaintenances = (maintenances || []).filter(
    (m: any) => new Date(m.created_at).getFullYear() === year,
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 pb-20 md:pb-0">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/admin/relatorios-manutencoes")}
              aria-label="Voltar"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <nav className="flex items-center gap-1.5 text-sm min-w-0">
              <button
                onClick={() => navigate("/admin/relatorios-manutencoes")}
                className="text-muted-foreground hover:text-foreground transition-colors truncate"
              >
                Relatórios de Manutenções
              </button>
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="font-semibold truncate">{owner.name}</span>
            </nav>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Owner card */}
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-start gap-4">
              {owner.photo_url ? (
                <img
                  src={owner.photo_url}
                  alt={owner.name}
                  className="h-16 w-16 sm:h-20 sm:w-20 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-xl sm:text-2xl font-semibold text-primary">
                    {owner.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0 space-y-1">
                <h2 className="text-lg sm:text-xl font-bold truncate">{owner.name}</h2>
                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">{owner.email}</span>
                  </span>
                  {owner.phone && (
                    <span className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                      {owner.phone}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <Badge variant="secondary" className="gap-1">
                    <Building2 className="h-3 w-3" />
                    {properties.length}{" "}
                    {properties.length === 1 ? "imóvel" : "imóveis"}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
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

              {properties.length > 0 && (
                <div className="space-y-2 w-64">
                  <label className="text-sm font-medium flex items-center gap-1">
                    <Building2 className="h-3 w-3" /> Imóvel
                  </label>
                  <Select
                    value={propertyId || "all"}
                    onValueChange={(v) => setPropertyId(v === "all" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os imóveis</SelectItem>
                      {properties.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Summary + Charts */}
        <MaintenanceSummaryCards summary={summary} />
        <MaintenanceCharts charts={charts} serviceTypeData={serviceTypeData} />

        {/* List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4 text-primary" />
              Manutenções de {year}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filteredYearMaintenances.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<Wrench className="h-6 w-6" />}
                  title="Nenhuma manutenção no período"
                  description="Não há manutenções registradas para esta seleção."
                />
              </div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3">Data</th>
                      <th className="text-left p-3">Imóvel</th>
                      <th className="text-left p-3">Título</th>
                      <th className="text-right p-3">Valor</th>
                      <th className="text-right p-3">Aporte</th>
                      <th className="text-right p-3">Devido</th>
                      <th className="text-right p-3">Pago</th>
                      <th className="text-center p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredYearMaintenances.map((m: any) => (
                      <tr
                        key={m.id}
                        className="border-t hover:bg-accent cursor-pointer transition-colors"
                        onClick={() => navigate(`/cobranca/${m.id}`)}
                      >
                        <td className="p-3 whitespace-nowrap">{formatDateTime(m.created_at)}</td>
                        <td className="p-3">{m.property?.name || "-"}</td>
                        <td className="p-3">
                          <div className="font-medium">{m.title}</div>
                          {m.category && (
                            <div className="text-xs text-muted-foreground">{m.category}</div>
                          )}
                        </td>
                        <td className="p-3 text-right font-medium">
                          {formatBRL(m.amount_cents)}
                        </td>
                        <td className="p-3 text-right text-success">
                          {m.management_contribution_cents > 0
                            ? formatBRL(m.management_contribution_cents)
                            : "-"}
                        </td>
                        <td className="p-3 text-right font-bold">
                          {formatBRL(
                            (m.amount_cents || 0) - (m.management_contribution_cents || 0),
                          )}
                        </td>
                        <td className="p-3 text-right">{formatBRL(m.paid_cents || 0)}</td>
                        <td className="p-3 text-center">{getStatusBadge(m.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
