import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import NovaManutencao from "@/pages/NovaManutencao";
import NovaCobranca from "@/pages/NovaCobranca";

interface EditMaintenanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editId: string | null;
  type: "maintenance" | "charge";
  onSaved?: () => void;
}

export function EditMaintenanceDialog({
  open,
  onOpenChange,
  editId,
  type,
  onSaved,
}: EditMaintenanceDialogProps) {
  if (!editId) return null;

  const handleClose = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>
            {type === "charge" ? "Editar Cobrança" : "Editar Manutenção"}
          </DialogTitle>
        </DialogHeader>
        <div className="px-2 pb-4">
          {type === "maintenance" ? (
            <NovaManutencao editId={editId} onClose={handleClose} onSaved={onSaved} />
          ) : (
            <NovaCobranca editId={editId} onClose={handleClose} onSaved={onSaved} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
