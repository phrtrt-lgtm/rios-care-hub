import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import NovaCobranca from "@/pages/NovaCobranca";

interface EditChargeFullDialogProps {
  chargeId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function EditChargeFullDialog({ chargeId, open, onOpenChange, onSaved }: EditChargeFullDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{chargeId ? "Editar Cobrança" : "Nova Cobrança"}</DialogTitle>
          <DialogDescription>
            {chargeId ? "Atualize as informações desta cobrança" : "Crie uma nova cobrança"}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <NovaCobranca
            embedded
            editId={chargeId ?? undefined}
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
