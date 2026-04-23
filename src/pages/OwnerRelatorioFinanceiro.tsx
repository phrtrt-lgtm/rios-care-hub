import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { goBack } from "@/lib/navigation";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { LoadingScreen } from "@/components/LoadingScreen";
import { FinancialReportView } from "@/components/report/FinancialReportView";
import { ReportData } from "@/lib/report-types";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { ReportAuditLog } from "@/components/report/admin/ReportAuditLog";

export default function OwnerRelatorioFinanceiro() {
  const { id } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isTeam =
    profile?.role === "admin" ||
    profile?.role === "agent" ||
    profile?.role === "maintenance";

  useEffect(() => {
    const fetchReport = async () => {
      if (!id || !user) return;

      try {
        const { data, error: fetchError } = await supabase
          .from('financial_reports')
          .select('*')
          .eq('id', id)
          .single();

        if (fetchError) throw fetchError;

        if (!data) {
          setError("Relatório não encontrado.");
          return;
        }

        setReportData(data.report_data as unknown as ReportData);
      } catch (err: any) {
        console.error('Error fetching report:', err);
        setError("Erro ao carregar o relatório.");
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [id, user]);

  if (loading) return <LoadingScreen />;

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => goBack(navigate, "/painel")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>
    );
  }

  if (!reportData) return null;

  return (
    <div className="min-h-screen bg-background">
      <FinancialReportView
        data={reportData}
        onBack={() =>
          navigate(isTeam ? "/admin/relatorios-financeiros" : "/minha-caixa")
        }
      />
      {isTeam && id && <ReportAuditLog reportId={id} />}
    </div>
  );
}

