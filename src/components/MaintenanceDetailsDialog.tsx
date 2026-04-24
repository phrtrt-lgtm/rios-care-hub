import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import ManutencaoDetalhes from "@/pages/ManutencaoDetalhes";

interface MaintenanceDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maintenanceId: string | null;
}

/**
 * Popup de acompanhamento de manutenção (read-only para proprietário).
 * Reaproveita a página /manutencao/:id em modo embedded.
 */
export function MaintenanceDetailsDialog({ open, onOpenChange, maintenanceId }: MaintenanceDetailsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="sr-only">
          <DialogTitle>Acompanhamento da manutenção</DialogTitle>
          <DialogDescription>Detalhes, mídias e atualizações publicadas pela equipe.</DialogDescription>
        </DialogHeader>
        {maintenanceId && <ManutencaoDetalhes embedded idOverride={maintenanceId} />}
      </DialogContent>
    </Dialog>
  );
}
