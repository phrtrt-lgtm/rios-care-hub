import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface ArchiveReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: {
    id: string;
    property_name: string;
    period_start: string | null;
    report_data: any;
  };
  onArchived: () => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value,
  );

export function ArchiveReportDialog({
  open,
  onOpenChange,
  report,
  onArchived,
}: ArchiveReportDialogProps) {
  const { profile } = useAuth();
  const [reason, setReason] = useState("");
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

  const handleArchive = async () => {
    setLoading(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("financial_reports")
        .update({
          status: "archived",
          archived_at: now,
          archived_by: profile?.id,
          archive_reason: reason || null,
        })
        .eq("id", report.id);

      if (error) throw error;

      await supabase.from("financial_report_audit_log").insert({
        report_id: report.id,
        action: "archived",
        actor_id: profile?.id,
        actor_name: profile?.name,
        actor_role: profile?.role,
        details: { reason: reason || null },
      });

      toast.success("Relatório arquivado", {
        description:
          "Você pode restaurá-lo a qualquer momento na aba Arquivados.",
        duration: 30000,
        action: {
          label: "Desfazer",
          onClick: async () => {
            await supabase
              .from("financial_reports")
              .update({
                status: "published",
                archived_at: null,
                archived_by: null,
                archive_reason: null,
              })
              .eq("id", report.id);
            await supabase.from("financial_report_audit_log").insert({
              report_id: report.id,
              action: "restored",
              actor_id: profile?.id,
              actor_name: profile?.name,
              actor_role: profile?.role,
              details: { via: "undo_toast" },
            });
            toast.success("Relatório restaurado");
            onArchived();
          },
        },
      });

      onOpenChange(false);
      setReason("");
      onArchived();
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao arquivar", { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Arquivar relatório?</DialogTitle>
          <DialogDescription>
            O relatório ficará oculto para o proprietário. Você pode restaurar a
            qualquer momento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
            <p>
              <span className="text-muted-foreground">Imóvel:</span>{" "}
              <span className="font-medium">{report.property_name}</span>
            </p>
            <p className="capitalize">
              <span className="text-muted-foreground">Período:</span>{" "}
              <span className="font-medium">{monthLabel}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Total:</span>{" "}
              <span className="font-medium">{formatCurrency(total)}</span>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Motivo do arquivamento (opcional)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Substituído por nova versão, dados incorretos..."
              rows={3}
            />
          </div>

          <div className="flex gap-2 text-xs text-muted-foreground bg-info/10 border border-info/20 rounded-md p-2">
            <Info className="h-4 w-4 text-info flex-shrink-0 mt-0.5" />
            <p>
              Relatórios arquivados ficam ocultos do proprietário mas podem ser
              restaurados a qualquer momento por um administrador.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button onClick={handleArchive} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Arquivar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
