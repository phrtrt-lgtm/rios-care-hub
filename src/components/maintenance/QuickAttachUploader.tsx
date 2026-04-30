import { useRef, useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { processFileForUpload } from "@/lib/fileUpload";
import { sanitizeFilename } from "@/lib/storage";
import { cn } from "@/lib/utils";

interface Props {
  itemId: string;
  isCharge: boolean;
  onSuccess?: () => void;
  className?: string;
}

/**
 * Botão "+" para anexar arquivos rapidamente a uma manutenção (ticket)
 * ou cobrança, sem precisar abrir o detalhe. Cria uma mensagem com o
 * anexo no chat correspondente.
 */
export function QuickAttachUploader({ itemId, isCharge, onSuccess, className }: Props) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading) inputRef.current?.click();
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const processed = await processFileForUpload(file);
        const safeName = sanitizeFilename(processed.name);
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${safeName}`;

        if (isCharge) {
          const filePath = `${itemId}/${fileName}`;
          const { error: upErr } = await supabase.storage
            .from("charge-attachments")
            .upload(filePath, processed);
          if (upErr) throw upErr;

          const { data: msg, error: msgErr } = await supabase
            .from("charge_messages")
            .insert({
              charge_id: itemId,
              author_id: user.id,
              body: `📎 Anexo: ${processed.name}`,
              is_internal: false,
            })
            .select("id")
            .single();
          if (msgErr) throw msgErr;

          const { error: attErr } = await supabase
            .from("charge_message_attachments")
            .insert({
              message_id: msg.id,
              charge_id: itemId,
              created_by: user.id,
              file_name: processed.name,
              file_path: filePath,
              file_size: processed.size,
              mime_type: processed.type,
            });
          if (attErr) throw attErr;
        } else {
          const filePath = `tickets/${itemId}/${fileName}`;
          const { error: upErr } = await supabase.storage
            .from("attachments")
            .upload(filePath, processed);
          if (upErr) throw upErr;

          const { data: { publicUrl } } = supabase.storage
            .from("attachments")
            .getPublicUrl(filePath);

          const { data: msg, error: msgErr } = await supabase
            .from("ticket_messages")
            .insert({
              ticket_id: itemId,
              author_id: user.id,
              body: `📎 Anexo: ${processed.name}`,
              is_internal: false,
            })
            .select("id")
            .single();
          if (msgErr) throw msgErr;

          const { error: attErr } = await supabase
            .from("ticket_attachments")
            .insert({
              ticket_id: itemId,
              message_id: msg.id,
              file_url: publicUrl,
              path: filePath,
              file_name: processed.name,
              file_type: processed.type,
              file_size: processed.size,
              size_bytes: processed.size,
              mime_type: processed.type,
            });
          if (attErr) throw attErr;
        }
      }
      toast.success("Anexo enviado!");
      onSuccess?.();
    } catch (err: any) {
      console.error("[QuickAttachUploader]", err);
      toast.error("Erro ao enviar anexo", { description: err.message });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
        className="hidden"
        onChange={handleChange}
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        onClick={handleClick}
        disabled={uploading}
        aria-label="Adicionar anexo"
        title="Adicionar anexo"
        className={cn(
          "h-8 w-8 flex items-center justify-center rounded-full hover:bg-primary/10 hover:text-primary text-muted-foreground active:scale-95 transition-all disabled:opacity-50",
          className,
        )}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
      </button>
    </>
  );
}
