import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, FileText, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MobileHeader } from "@/components/MobileHeader";
import { MobileBottomNav } from "@/components/MobileBottomNav";

interface FinancialReport {
  id: string;
  property_name: string;
  report_type: string;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  report_data: any;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatMonthLabel = (start: string | null): string => {
  if (!start) return "Sem período";
  try {
    const d = new Date(start + 'T00:00:00');
    return format(d, "MMMM", { locale: ptBR }).replace(/^\w/, c => c.toUpperCase());
  } catch {
    return "Sem período";
  }
};

export default function RelatoriosPropriedade() {
  const { propertyId } = useParams<{ propertyId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reports, setReports] = useState<FinancialReport[]>([]);
  const [propertyName, setPropertyName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      if (!propertyId || !user) return;

      try {
        const [{ data: prop }, { data: reps }] = await Promise.all([
          supabase.from('properties').select('name').eq('id', propertyId).single(),
          supabase
            .from('financial_reports')
            .select('id, property_name, report_type, period_start, period_end, created_at, report_data')
            .eq('property_id', propertyId)
            .eq('status', 'published')
            .order('period_start', { ascending: false }),
        ]);

        setPropertyName(prop?.name || "");
        setReports(reps || []);
      } catch (err) {
        console.error('Error fetching reports:', err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [propertyId, user]);

  // Group by year
  const reportsByYear: Record<string, FinancialReport[]> = {};
  reports.forEach(r => {
    const year = r.period_start ? new Date(r.period_start + 'T00:00:00').getFullYear().toString() : 'Outros';
    if (!reportsByYear[year]) reportsByYear[year] = [];
    reportsByYear[year].push(r);
  });

  return (
    <div className="min-h-screen bg-background pb-24">
      <MobileHeader title="Relatórios Financeiros" leftAction={
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
      } />

      <div className="p-4 max-w-2xl mx-auto space-y-4">
        <p className="text-sm text-muted-foreground">{propertyName}</p>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Nenhum relatório publicado ainda.</p>
          </div>
        ) : (
          Object.entries(reportsByYear)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([year, yearReports]) => (
              <div key={year} className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                  {year}
                </h3>
                <div className="space-y-1.5">
                  {yearReports.map(report => {
                    const ownerNet = report.report_data?.totals?.totalOwnerNet || 0;
                    const isAnnual = report.report_type === 'anual';

                    return (
                      <div
                        key={report.id}
                        onClick={() => navigate(`/relatorio-financeiro/${report.id}`)}
                        className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                          isAnnual
                            ? 'bg-primary/10 hover:bg-primary/15 border border-primary/20'
                            : 'bg-card hover:bg-accent/50 border'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className={`h-4 w-4 flex-shrink-0 ${isAnnual ? 'text-primary' : 'text-muted-foreground'}`} />
                          <p className="font-medium text-sm truncate">
                            {isAnnual ? `Relatório Anual ${year}` : formatMonthLabel(report.period_start)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {ownerNet !== 0 && (
                            <span className={`font-semibold text-sm ${ownerNet > 0 ? 'text-success' : 'text-destructive'}`}>
                              {formatCurrency(ownerNet)}
                            </span>
                          )}
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
        )}
      </div>

      <MobileBottomNav />
    </div>
  );
}