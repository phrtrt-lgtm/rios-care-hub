import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import NovaManutencao from "@/pages/NovaManutencao";

interface EditMaintenanceDialogProps {
  ticketId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function EditMaintenanceDialog({ ticketId, open, onOpenChange, onSaved }: EditMaintenanceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{ticketId ? "Editar Manutenção" : "Nova Manutenção"}</DialogTitle>
          <DialogDescription>
            {ticketId ? "Atualize as informações deste chamado" : "Registre um novo chamado de manutenção"}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <NovaManutencao
            embedded
            editId={ticketId ?? undefined}
            onCancel={() => onOpenChange(false)}
            onSaved={() => {
              onSaved?.();
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
