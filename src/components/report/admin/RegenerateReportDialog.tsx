import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, AlertTriangle, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  filterReservations,
  generateReport,
  formatReportCurrency,
} from "@/lib/report-calculations";
import {
  Reservation,
  ReportType,
  ReportConfig,
  ReportData,
} from "@/lib/report-types";

interface RegenerateReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: {
    id: string;
    property_name: string;
    report_type: string;
    commission_percentage: number;
    period_start: string | null;
    period_end: string | null;
    report_data: any;
  };
  onRegenerated: () => void;
}

const REPORT_TYPES: { value: ReportType; label: string }[] = [
  { value: "management", label: "Gestão" },
  { value: "management_cleaning", label: "Gestão + Limpeza" },
  { value: "owner", label: "Proprietário" },
  { value: "owner_management", label: "Proprietário + Gestão" },
  {
    value: "owner_management_cleaning",
    label: "Proprietário + Gestão + Limpeza",
  },
];

export function RegenerateReportDialog({
  open,
  onOpenChange,
  report,
  onRegenerated,
}: RegenerateReportDialogProps) {
  const { profile } = useAuth();
  const [reportType, setReportType] = useState<ReportType>(
    report.report_type as ReportType,
  );
  const [commission, setCommission] = useState(report.commission_percentage);
  const [startDate, setStartDate] = useState(report.period_start ?? "");
  const [endDate, setEndDate] = useState(report.period_end ?? "");
  const [acknowledged, setAcknowledged] = useState(false);
  const [loading, setLoading] = useState(false);

  // Reservas brutas vêm de report_data.config.selectedReservations
  const sourceReservations: Reservation[] = useMemo(() => {
    const raw = report.report_data?.config?.selectedReservations as any[];
    if (!Array.isArray(raw)) return [];
    return raw.map((r) => ({
      ...r,
      checkin_date: new Date(r.checkin_date),
      checkout_date: new Date(r.checkout_date),
    })) as Reservation[];
  }, [report]);

  const previousTotals = report.report_data?.totals ?? null;

  // Preview: roda o cálculo localmente sem persistir
  const preview: ReportData | null = useMemo(() => {
    if (sourceReservations.length === 0) return null;
    const filtered = filterReservations(
      sourceReservations,
      report.property_name,
      startDate ? new Date(startDate + "T00:00:00") : null,
      endDate ? new Date(endDate + "T23:59:59") : null,
      !startDate || !endDate,
    );
    const config: ReportConfig = {
      propertyName: report.property_name,
      startDate: startDate ? new Date(startDate + "T00:00:00") : null,
      endDate: endDate ? new Date(endDate + "T23:59:59") : null,
      useAllDates: !startDate || !endDate,
      commissionPercentage: Number(commission),
      reportType,
      selectedReservations: filtered,
    };
    return generateReport(config);
  }, [sourceReservations, report.property_name, startDate, endDate, commission, reportType]);

  useEffect(() => {
    if (!open) {
      setAcknowledged(false);
      setReportType(report.report_type as ReportType);
      setCommission(report.commission_percentage);
      setStartDate(report.period_start ?? "");
      setEndDate(report.period_end ?? "");
    }
  }, [open, report]);

  const noSourceData = sourceReservations.length === 0;

  const handleConfirm = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("financial_reports")
        .update({
          report_type: reportType,
          commission_percentage: Number(commission),
          period_start: startDate || null,
          period_end: endDate || null,
          report_data: preview as any,
          updated_by: profile?.id,
        })
        .eq("id", report.id);

      if (error) throw error;

      await supabase.from("financial_report_audit_log").insert({
        report_id: report.id,
        action: "regenerated",
        actor_id: profile?.id,
        actor_name: profile?.name,
        actor_role: profile?.role,
        details: {
          previousTotals,
          newParams: {
            reportType,
            commission: Number(commission),
            startDate,
            endDate,
          },
        },
      });

      toast.success("Relatório regerado");
      onOpenChange(false);
      onRegenerated();
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao regerar", { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Regerar relatório</DialogTitle>
          <DialogDescription>
            Ajuste os parâmetros e veja o impacto antes de substituir os dados
            calculados.
          </DialogDescription>
        </DialogHeader>

        {noSourceData ? (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 text-sm space-y-2">
            <div className="flex gap-2 items-start">
              <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-foreground">
                  Regeração indisponível
                </p>
                <p className="text-muted-foreground mt-1">
                  Este relatório foi gerado antes da implementação do recurso de
                  regerar. Os dados-fonte das reservas não foram salvos. Para
                  substituí-lo, exclua-o (após arquivar) e gere um novo a partir
                  do Excel original.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tipo de relatório</Label>
                <Select
                  value={reportType}
                  onValueChange={(v) => setReportType(v as ReportType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REPORT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>% Comissão</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={commission}
                  onChange={(e) => setCommission(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Início do período</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Fim do período</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            {/* Preview antes/depois */}
            {preview && previousTotals && (
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Comparação
                </p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-muted-foreground" />
                  <div className="text-muted-foreground text-center">
                    Antes
                  </div>
                  <div className="text-muted-foreground text-center">
                    Depois
                  </div>

                  {[
                    { label: "Reservas", key: "reservationCount", fmt: (n: number) => String(n) },
                    { label: "Líquido proprietário", key: "totalOwnerNet", fmt: formatReportCurrency },
                    { label: "Comissão gestão", key: "totalManagementCommission", fmt: formatReportCurrency },
                    { label: "Total geral", key: "totalGeneral", fmt: formatReportCurrency },
                  ].map((row) => {
                    const before = previousTotals[row.key] ?? 0;
                    const after = (preview.totals as any)[row.key] ?? 0;
                    const changed = before !== after;
                    return (
                      <div key={row.key} className="contents">
                        <div className="text-foreground py-1">{row.label}</div>
                        <div className="text-center font-mono py-1">
                          {row.fmt(before)}
                        </div>
                        <div
                          className={`text-center font-mono py-1 flex items-center justify-center gap-1 ${
                            changed ? "text-primary font-semibold" : ""
                          }`}
                        >
                          {changed && <ArrowRight className="h-3 w-3" />}
                          {row.fmt(after)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-lg p-3">
              <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
              <div className="text-xs text-foreground space-y-2">
                <p>
                  Essa ação vai substituir os dados calculados do relatório. O
                  histórico fica registrado, mas os números anteriores não
                  podem ser restaurados automaticamente.
                </p>
                <label className="flex items-center gap-2 pt-1">
                  <Checkbox
                    checked={acknowledged}
                    onCheckedChange={(c) => setAcknowledged(!!c)}
                  />
                  <span className="text-foreground">
                    Entendo que essa ação substitui os dados.
                  </span>
                </label>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={noSourceData || !acknowledged || !preview || loading}
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Sim, regerar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
