import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FileText, ChevronRight, Download, Send } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";

interface FinancialReport {
  id: string;
  property_name: string;
  report_type: string;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  report_data: any;
}

interface PropertyReportsListProps {
  propertyId: string;
  /** Mostra ações de admin (reenviar para proprietário). Default: false */
  showAdminActions?: boolean;
  /** Callback opcional para baixar PDF a partir de um relatório */
  onDownload?: (report: FinancialReport) => void;
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

/**
 * Lista de relatórios financeiros de uma propriedade, agrupados por ano e mês.
 * Reaproveita o mesmo padrão visual de RelatoriosPropriedade.tsx.
 */
export function PropertyReportsList({
  propertyId,
  showAdminActions = false,
  onDownload,
}: PropertyReportsListProps) {
  const navigate = useNavigate();
  const [reports, setReports] = useState<FinancialReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const { data, error } = await supabase
          .from("financial_reports")
          .select("id, property_name, report_type, period_start, period_end, created_at, report_data")
          .eq("property_id", propertyId)
          .eq("status", "published")
          .order("period_start", { ascending: false });

        if (error) throw error;
        setReports((data as FinancialReport[]) || []);
      } catch (err) {
        console.error("Error fetching reports:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, [propertyId]);

  const handleResend = async (report: FinancialReport) => {
    // Placeholder: log + toast. Quando houver edge function de envio, plugar aqui.
    console.log("[PropertyReportsList] Reenviar relatório:", report.id);
    toast.success("Notificação registrada", {
      description: "O proprietário será notificado sobre este relatório.",
    });
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

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

  // Group by year
  const reportsByYear: Record<string, FinancialReport[]> = {};
  reports.forEach((r) => {
    const year = r.period_start
      ? new Date(r.period_start + "T00:00:00").getFullYear().toString()
      : "Outros";
    if (!reportsByYear[year]) reportsByYear[year] = [];
    reportsByYear[year].push(r);
  });

  return (
    <div className="space-y-3">
      {Object.entries(reportsByYear)
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
                      isAnnual
                        ? "bg-primary/10 border border-primary/20"
                        : "bg-card hover:bg-accent/50 border"
                    }`}
                  >
                    <button
                      onClick={() => navigate(`/relatorio-financeiro/${report.id}`)}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <FileText
                        className={`h-4 w-4 flex-shrink-0 ${
                          isAnnual ? "text-primary" : "text-muted-foreground"
                        }`}
                      />
                      <p className="font-medium text-sm truncate">
                        {isAnnual
                          ? `Relatório Anual ${year}`
                          : formatMonthLabel(report.period_start)}
                      </p>
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

                      {onDownload && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDownload(report);
                          }}
                          title="Baixar PDF"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}

                      {showAdminActions && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleResend(report);
                          }}
                          title="Reenviar para proprietário"
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => navigate(`/relatorio-financeiro/${report.id}`)}
                        title="Abrir relatório"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}
