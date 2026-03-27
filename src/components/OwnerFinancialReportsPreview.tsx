import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, ChevronRight, Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface FinancialReport {
  id: string;
  property_name: string;
  report_type: string;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  status: string;
  report_data: any;
}

export const OwnerFinancialReportsPreview = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reports, setReports] = useState<FinancialReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReports = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('financial_reports')
          .select('id, property_name, report_type, period_start, period_end, created_at, status, report_data')
          .eq('owner_id', user.id)
          .eq('status', 'published')
          .order('created_at', { ascending: false })
          .limit(10);

        if (error) throw error;
        setReports(data || []);
      } catch (error) {
        console.error('Error fetching financial reports:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [user]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (reports.length === 0) return null;

  const formatPeriod = (start: string | null, end: string | null) => {
    if (!start || !end) return "Período não informado";
    try {
      const s = new Date(start + 'T00:00:00');
      const e = new Date(end + 'T00:00:00');
      return `${format(s, "dd/MM/yyyy")} a ${format(e, "dd/MM/yyyy")}`;
    } catch {
      return "Período não informado";
    }
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-5 w-5 text-blue-600" />
          Relatórios Financeiros
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {reports.map((report) => {
          const totals = report.report_data?.totals;
          const ownerNet = totals?.totalOwnerNet || 0;
          
          return (
            <div
              key={report.id}
              onClick={() => navigate(`/relatorio-financeiro/${report.id}`)}
              className="flex items-center justify-between p-3 rounded-lg bg-background border hover:border-blue-300 hover:shadow-sm cursor-pointer transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <FileText className="h-4 w-4 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{report.property_name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatPeriod(report.period_start, report.period_end)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {ownerNet > 0 && (
                  <span className="text-sm font-semibold text-emerald-600">
                    {formatCurrency(ownerNet)}
                  </span>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
