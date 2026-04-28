import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type TableName =
  | "cleaning_inspection_attachments"
  | "ticket_attachments"
  | "charge_attachments";

interface Props {
  table: TableName;
  attachmentId: string;
  fileName?: string | null;
  onDeleted?: () => void;
  /** Render mode: "icon" (small overlay) or "button" (inline) */
  mode?: "icon" | "button";
  className?: string;
}

export function DeleteAttachmentButton({
  table,
  attachmentId,
  fileName,
  onDeleted,
  mode = "icon",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.from(table).delete().eq("id", attachmentId);
      if (error) throw error;
      toast.success("Anexo excluído");
      setOpen(false);
      onDeleted?.();
    } catch (e: any) {
      console.error(e);
      toast.error("Erro ao excluir anexo");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {mode === "icon" ? (
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          className={"h-7 w-7 p-0 " + (className ?? "")}
          title="Excluir anexo"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          className={"text-destructive hover:text-destructive gap-2 " + (className ?? "")}
        >
          <Trash2 className="h-4 w-4" />
          Excluir
        </Button>
      )}

      <ConfirmationDialog
        open={open}
        onOpenChange={setOpen}
        title="Excluir anexo?"
        description={
          <div className="space-y-2">
            <p>Esta ação é permanente e não pode ser desfeita.</p>
            {fileName && (
              <p className="text-xs">
                Arquivo: <span className="font-mono">{fileName}</span>
              </p>
            )}
          </div>
        }
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={handleConfirm}
        loading={loading}
      />
    </>
  );
}
