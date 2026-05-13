import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Search, Plus, FileText, ChevronRight, Building2, Calendar, Users, ArrowUpDown } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface OwnerSummary {
  id: string;
  name: string;
  email: string;
  total_properties: number;
  total_reports: number;
  last_report_date: string | null;
  current_year_owner_net: number;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const formatLastReport = (date: string | null): string => {
  if (!date) return "Sem relatório";
  try {
    const d = new Date(date);
    const label = format(d, "MMMM 'de' yyyy", { locale: ptBR });
    return `Último: ${label.charAt(0).toUpperCase() + label.slice(1)}`;
  } catch {
    return "Sem relatório";
  }
};

export default function AdminRelatoriosFinanceiros() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [owners, setOwners] = useState<OwnerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [propertyMatchOwners, setPropertyMatchOwners] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchData = async () => {
      try {
        const currentYear = new Date().getFullYear();
        const yearStart = `${currentYear}-01-01`;
        const yearEnd = `${currentYear}-12-31`;

        // 1) Buscar todos os owners
        const { data: ownersData, error: ownersError } = await supabase
          .from("profiles")
          .select("id, name, email")
          .eq("role", "owner")
          .order("name");

        if (ownersError) throw ownersError;

        // 2) Buscar propriedades ativas (agrupadas por owner)
        const { data: propsData, error: propsError } = await supabase
          .from("properties")
          .select("id, owner_id")
          .is("archived_at", null);

        if (propsError) throw propsError;

        const propertiesByOwner = new Map<string, string[]>();
        (propsData || []).forEach((p) => {
          if (!propertiesByOwner.has(p.owner_id)) {
            propertiesByOwner.set(p.owner_id, []);
          }
          propertiesByOwner.get(p.owner_id)!.push(p.id);
        });

        // 3) Buscar relatórios publicados
        const { data: reportsData, error: reportsError } = await supabase
          .from("financial_reports")
          .select("id, property_id, owner_id, period_start, created_at, report_data, status")
          .eq("status", "published");

        if (reportsError) throw reportsError;

        // 4) Agregar por owner
        const summaries: OwnerSummary[] = (ownersData || []).map((owner) => {
          const ownerPropIds = propertiesByOwner.get(owner.id) || [];
          const ownerReports = (reportsData || []).filter(
            (r) =>
              r.owner_id === owner.id ||
              (r.property_id && ownerPropIds.includes(r.property_id))
          );

          const lastDate = ownerReports.length
            ? ownerReports
                .map((r) => r.created_at)
                .sort((a, b) => (b > a ? 1 : -1))[0]
            : null;

          const currentYearNet = ownerReports
            .filter(
              (r) =>
                r.period_start &&
                r.period_start >= yearStart &&
                r.period_start <= yearEnd
            )
            .reduce((acc, r) => {
              const net = (r.report_data as any)?.totals?.totalOwnerNet || 0;
              return acc + net;
            }, 0);

          return {
            id: owner.id,
            name: owner.name,
            email: owner.email,
            total_properties: ownerPropIds.length,
            total_reports: ownerReports.length,
            last_report_date: lastDate,
            current_year_owner_net: currentYearNet,
          };
        });

        // Ordenar: relatório mais recente primeiro, depois por nome
        summaries.sort((a, b) => {
          if (a.last_report_date && b.last_report_date) {
            return b.last_report_date.localeCompare(a.last_report_date);
          }
          if (a.last_report_date) return -1;
          if (b.last_report_date) return 1;
          return a.name.localeCompare(b.name);
        });

        setOwners(summaries);
      } catch (err) {
        console.error("Error loading owners:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Busca por nome do imóvel: cruza com properties
  useEffect(() => {
    const term = search.trim().toLowerCase();
    if (term.length < 2) {
      setPropertyMatchOwners(new Set());
      return;
    }

    const fetchByProperty = async () => {
      const { data } = await supabase
        .from("properties")
        .select("owner_id, name")
        .ilike("name", `%${term}%`)
        .is("archived_at", null);

      setPropertyMatchOwners(new Set((data || []).map((p) => p.owner_id)));
    };
    fetchByProperty();
  }, [search]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return owners;
    return owners.filter(
      (o) =>
        o.name.toLowerCase().includes(term) ||
        o.email.toLowerCase().includes(term) ||
        propertyMatchOwners.has(o.id)
    );
  }, [owners, search, propertyMatchOwners]);

  const totalReports = owners.reduce((sum, o) => sum + o.total_reports, 0);
  const ownersWithReports = owners.filter((o) => o.total_reports > 0).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 pb-20 md:pb-0">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/painel")}
                aria-label="Voltar ao painel"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold truncate">Relatórios Financeiros</h1>
                <p className="text-xs text-muted-foreground truncate">
                  Consulte relatórios por proprietário
                </p>
              </div>
            </div>

            <Button
              onClick={() => navigate("/relatorio-financeiro")}
              size="sm"
              className="flex-shrink-0"
            >
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Gerar novo relatório</span>
              <span className="sm:hidden">Novo</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" /> Proprietários
              </div>
              <p className="text-2xl font-bold mt-1">{owners.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="h-3.5 w-3.5" /> Relatórios publicados
              </div>
              <p className="text-2xl font-bold mt-1">{totalReports}</p>
            </CardContent>
          </Card>
          <Card className="col-span-2 sm:col-span-1">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" /> Com relatório
              </div>
              <p className="text-2xl font-bold mt-1">{ownersWithReports}</p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome do proprietário, email ou imóvel..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title={search ? "Nenhum proprietário encontrado" : "Nenhum proprietário cadastrado"}
            description={
              search
                ? "Tente buscar por outro nome, email ou imóvel."
                : "Cadastre proprietários para começar a gerar relatórios."
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((owner) => (
              <Card
                key={owner.id}
                className="cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30"
                onClick={() => navigate(`/admin/relatorios-financeiros/${owner.id}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base truncate">{owner.name}</CardTitle>
                      <CardDescription className="text-xs truncate mt-0.5">
                        {owner.email}
                      </CardDescription>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="secondary" className="gap-1">
                      <Building2 className="h-3 w-3" />
                      {owner.total_properties}{" "}
                      {owner.total_properties === 1 ? "imóvel" : "imóveis"}
                    </Badge>
                    <Badge variant="secondary" className="gap-1">
                      <FileText className="h-3 w-3" />
                      {owner.total_reports}{" "}
                      {owner.total_reports === 1 ? "relatório" : "relatórios"}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span className="truncate">{formatLastReport(owner.last_report_date)}</span>
                  </div>

                  {owner.current_year_owner_net !== 0 && (
                    <div className="flex items-center justify-between pt-2 border-t">
                      <span className="text-xs text-muted-foreground">
                        Líquido {new Date().getFullYear()}
                      </span>
                      <span
                        className={`text-sm font-semibold ${
                          owner.current_year_owner_net > 0
                            ? "text-success"
                            : "text-destructive"
                        }`}
                      >
                        {formatCurrency(owner.current_year_owner_net)}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
