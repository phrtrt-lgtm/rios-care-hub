import { useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

interface EditReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: {
    id: string;
    owner_id: string;
    commission_percentage: number;
    internal_notes: string | null;
    property_name: string;
  };
  onSaved: () => void;
}

interface OwnerOption {
  id: string;
  name: string;
  email: string;
}

export function EditReportDialog({
  open,
  onOpenChange,
  report,
  onSaved,
}: EditReportDialogProps) {
  const { profile } = useAuth();
  const [owners, setOwners] = useState<OwnerOption[]>([]);
  const [ownerId, setOwnerId] = useState(report.owner_id);
  const [commission, setCommission] = useState(report.commission_percentage);
  const [notes, setNotes] = useState(report.internal_notes ?? "");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOwnerId(report.owner_id);
    setCommission(report.commission_percentage);
    setNotes(report.internal_notes ?? "");

    const loadOwners = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, name, email")
        .eq("role", "owner")
        .order("name");
      if (data) setOwners(data as OwnerOption[]);
    };
    loadOwners();
  }, [open, report]);

  const hasChanges =
    ownerId !== report.owner_id ||
    Number(commission) !== Number(report.commission_percentage) ||
    notes !== (report.internal_notes ?? "");

  const handleSave = async () => {
    setSaving(true);
    try {
      const changes: Record<string, { from: any; to: any }> = {};
      if (ownerId !== report.owner_id)
        changes.owner_id = { from: report.owner_id, to: ownerId };
      if (Number(commission) !== Number(report.commission_percentage))
        changes.commission_percentage = {
          from: report.commission_percentage,
          to: Number(commission),
        };
      if (notes !== (report.internal_notes ?? ""))
        changes.internal_notes = {
          from: report.internal_notes ?? "",
          to: notes,
        };

      const { error } = await supabase
        .from("financial_reports")
        .update({
          owner_id: ownerId,
          commission_percentage: Number(commission),
          internal_notes: notes || null,
          updated_by: profile?.id,
        })
        .eq("id", report.id);

      if (error) throw error;

      // Audit log
      await supabase.from("financial_report_audit_log").insert({
        report_id: report.id,
        action: "updated",
        actor_id: profile?.id,
        actor_name: profile?.name,
        actor_role: profile?.role,
        details: { changes },
      });

      toast.success("Relatório atualizado");
      setConfirmOpen(false);
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao atualizar relatório", {
        description: err.message,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar metadados</DialogTitle>
            <DialogDescription>
              Edite os campos abaixo do relatório de{" "}
              <span className="font-medium text-foreground">
                {report.property_name}
              </span>
              . Esses ajustes não regeram os cálculos do relatório.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="owner">Proprietário associado</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger id="owner">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {owners.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}{" "}
                      <span className="text-muted-foreground text-xs">
                        ({o.email})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="commission">% Comissão exibida</Label>
              <Input
                id="commission"
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={commission}
                onChange={(e) => setCommission(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Apenas exibição. Para alterar os cálculos, use “Regerar com
                novos parâmetros”.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Anotações internas</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anotações visíveis apenas para a equipe — não aparecem no PDF."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!hasChanges || saving}
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirmar alterações"
        description="As alterações serão salvas no histórico e aplicadas imediatamente."
        confirmLabel="Confirmar"
        onConfirm={handleSave}
        loading={saving}
      />
    </>
  );
}
