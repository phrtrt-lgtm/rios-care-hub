import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileText, Archive } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ReportActionsMenu,
  ReportLite,
} from "./admin/ReportActionsMenu";

interface PropertyReportsListProps {
  propertyId: string;
  showAdminActions?: boolean;
  onDownload?: (report: ReportLite) => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const formatMonthLabel = (start: string | null): string => {
  if (!start) return "Sem período";
  try {
    const d = new Date(start + "T00:00:00");
    return format(d, "MMMM", { locale: ptBR }).replace(/^\w/, (c) => c.toUpperCase());
  } catch {
    return "Sem período";
  }
};

export function PropertyReportsList({
  propertyId,
  showAdminActions = false,
  onDownload,
}: PropertyReportsListProps) {
  const navigate = useNavigate();
  const [reports, setReports] = useState<ReportLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"active" | "archived">("active");

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("financial_reports")
        .select(
          "id, property_name, owner_id, report_type, commission_percentage, internal_notes, status, period_start, period_end, created_at, report_data",
        )
        .eq("property_id", propertyId)
        .order("period_start", { ascending: false });
      if (error) throw error;
      setReports((data as ReportLite[]) || []);
    } catch (err) {
      console.error("Error fetching reports:", err);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const activeReports = reports.filter((r) => r.status !== "archived");
  const archivedReports = reports.filter((r) => r.status === "archived");

  if (reports.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-5 w-5" />}
        title="Nenhum relatório gerado ainda"
        description="Quando relatórios forem publicados para este imóvel, aparecerão aqui."
        className="py-6"
      />
    );
  }

  const renderList = (list: ReportLite[], dimmed = false) => {
    if (list.length === 0) {
      return (
        <EmptyState
          icon={dimmed ? <Archive className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
          title={dimmed ? "Nenhum arquivado" : "Nenhum ativo"}
          description={
            dimmed
              ? "Relatórios arquivados aparecem aqui."
              : "Relatórios publicados aparecem aqui."
          }
          className="py-6"
        />
      );
    }

    // Group by year
    const byYear: Record<string, ReportLite[]> = {};
    list.forEach((r) => {
      const year = r.period_start
        ? new Date(r.period_start + "T00:00:00").getFullYear().toString()
        : "Outros";
      if (!byYear[year]) byYear[year] = [];
      byYear[year].push(r);
    });

    return (
      <div className="space-y-3">
        {Object.entries(byYear)
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([year, yearReports]) => (
            <div key={year} className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                {year}
              </h4>
              <div className="space-y-1.5">
                {yearReports.map((report) => {
                  const ownerNet = report.report_data?.totals?.totalOwnerNet || 0;
                  const isAnnual = report.report_type === "anual";

                  return (
                    <div
                      key={report.id}
                      className={`flex items-center justify-between gap-2 p-3 rounded-lg transition-colors ${
                        dimmed
                          ? "bg-muted/30 border opacity-70 hover:opacity-100"
                          : isAnnual
                          ? "bg-primary/10 border border-primary/20"
                          : "bg-card hover:bg-accent/50 border"
                      }`}
                    >
                      <button
                        onClick={() =>
                          navigate(`/relatorio-financeiro/${report.id}`)
                        }
                        className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                      >
                        {dimmed ? (
                          <Archive className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        ) : (
                          <FileText
                            className={`h-4 w-4 flex-shrink-0 ${
                              isAnnual ? "text-primary" : "text-muted-foreground"
                            }`}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">
                            {isAnnual
                              ? `Relatório Anual ${year}`
                              : formatMonthLabel(report.period_start)}
                          </p>
                          {dimmed && (
                            <p className="text-xs text-muted-foreground truncate">
                              Arquivado
                              {report.report_data?.archive_reason
                                ? ` · ${report.report_data.archive_reason}`
                                : ""}
                            </p>
                          )}
                        </div>
                      </button>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        {ownerNet !== 0 && (
                          <span
                            className={`font-semibold text-sm mr-1 ${
                              ownerNet > 0 ? "text-success" : "text-destructive"
                            }`}
                          >
                            {formatCurrency(ownerNet)}
                          </span>
                        )}
                        <ReportActionsMenu
                          report={report}
                          onChanged={fetchReports}
                          onDownload={onDownload}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
      </div>
    );
  };

  // Sem ações de admin: renderiza só ativos no formato antigo (owner view)
  if (!showAdminActions) {
    return renderList(activeReports);
  }

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as "active" | "archived")}
    >
      <TabsList className="mb-3">
        <TabsTrigger value="active">
          Ativos
          <span className="ml-1.5 text-xs text-muted-foreground">
            ({activeReports.length})
          </span>
        </TabsTrigger>
        <TabsTrigger value="archived">
          Arquivados
          <span className="ml-1.5 text-xs text-muted-foreground">
            ({archivedReports.length})
          </span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="active" className="mt-0">
        {renderList(activeReports)}
      </TabsContent>
      <TabsContent value="archived" className="mt-0">
        {renderList(archivedReports, true)}
      </TabsContent>
    </Tabs>
  );
}
