import { useState } from "react";
import { Archive, ArchiveRestore } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  inspectionId: string;
  archived: boolean;
  onDone?: () => void;
  size?: "sm" | "default";
  variant?: "outline" | "ghost" | "destructive";
}

export function ArchiveInspectionButton({
  inspectionId,
  archived,
  onDone,
  size = "sm",
  variant = "outline",
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("cleaning_inspections")
        .update({ archived_at: archived ? null : new Date().toISOString() })
        .eq("id", inspectionId);
      if (error) throw error;
      toast.success(archived ? "Vistoria desarquivada" : "Vistoria arquivada");
      setOpen(false);
      onDone?.();
    } catch (e: any) {
      console.error(e);
      toast.error("Erro ao " + (archived ? "desarquivar" : "arquivar") + " vistoria");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        size={size}
        variant={variant}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="gap-2"
      >
        {archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
        {archived ? "Desarquivar" : "Arquivar"}
      </Button>

      <ConfirmationDialog
        open={open}
        onOpenChange={setOpen}
        title={archived ? "Desarquivar vistoria?" : "Arquivar vistoria?"}
        description={
          archived
            ? "A vistoria voltará para as listagens normais."
            : "A vistoria será removida das listagens normais. Você poderá recuperá-la em 'Vistorias arquivadas'."
        }
        confirmLabel={archived ? "Desarquivar" : "Arquivar"}
        onConfirm={handleConfirm}
        loading={loading}
      />
    </>
  );
}
