import { useState } from "react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface DeleteReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: {
    id: string;
    property_name: string;
    period_start: string | null;
    report_data: any;
  };
  onDeleted: () => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value,
  );

export function DeleteReportDialog({
  open,
  onOpenChange,
  report,
  onDeleted,
}: DeleteReportDialogProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);

  const monthLabel = report.period_start
    ? new Date(report.period_start + "T00:00:00").toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      })
    : "—";
  const total =
    report.report_data?.totals?.totalOwnerNet ??
    report.report_data?.totals?.totalGeneral ??
    0;

  const handleDelete = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.rpc("delete_financial_report", {
        p_report_id: report.id,
        p_actor_name: profile?.name ?? "",
        p_actor_role: profile?.role ?? "",
      });
      if (error) throw error;
      toast.success("Relatório excluído permanentemente");
      onOpenChange(false);
      onDeleted();
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao excluir", { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Excluir permanentemente?"
      variant="destructive"
      confirmLabel="Excluir permanentemente"
      requireTypedConfirmation="EXCLUIR"
      loading={loading}
      onConfirm={handleDelete}
      description={
        <>
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-foreground">
            Essa ação não pode ser desfeita. O relatório e seu conteúdo serão
            removidos permanentemente. Apenas o registro no histórico permanece.
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">
              Será removido:
            </p>
            <p className="capitalize">
              Relatório de <span className="font-medium">{monthLabel}</span> —{" "}
              <span className="font-medium">{report.property_name}</span> —{" "}
              <span className="font-medium">{formatCurrency(total)}</span>
            </p>
          </div>
        </>
      }
    />
  );
}
