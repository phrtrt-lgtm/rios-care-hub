import { useRef, useState } from "react";
import { Paperclip, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { processFileForUpload } from "@/lib/fileUpload";

interface QuickAttachmentButtonProps {
  ticketId: string;
  onSuccess?: () => void;
}

export function QuickAttachmentButton({ ticketId, onSuccess }: QuickAttachmentButtonProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;

    setUploading(true);

    try {
      // Process and upload each file
      for (const file of Array.from(files)) {
        // Process file (compress if video)
        const processedFile = await processFileForUpload(file, (progress) => {
          console.log('[QuickAttachment]', progress.message);
        });

        // Upload to storage
        const fileExt = processedFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `tickets/${ticketId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('ticket-attachments')
          .upload(filePath, processedFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('ticket-attachments')
          .getPublicUrl(filePath);

        // Create a message with the attachment
        const { data: message, error: messageError } = await supabase
          .from('ticket_messages')
          .insert({
            ticket_id: ticketId,
            author_id: user.id,
            body: `📎 Anexo: ${processedFile.name}`,
            is_internal: false,
          })
          .select('id')
          .single();

        if (messageError) throw messageError;

        // Create attachment record
        const { error: attachmentError } = await supabase
          .from('ticket_attachments')
          .insert({
            ticket_id: ticketId,
            message_id: message.id,
            file_url: publicUrl,
            path: filePath,
            file_name: processedFile.name,
            file_type: processedFile.type,
            file_size: processedFile.size,
            mime_type: processedFile.type,
          });

        if (attachmentError) throw attachmentError;
      }

      toast.success("Anexo enviado!");
      onSuccess?.();
    } catch (error) {
      console.error("Error uploading attachment:", error);
      toast.error("Erro ao enviar anexo");
    } finally {
      setUploading(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        multiple
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
      />
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 shrink-0"
        onClick={handleClick}
        disabled={uploading}
        title="Adicionar anexo"
      >
        {uploading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Paperclip className="h-3.5 w-3.5" />
        )}
      </Button>
    </>
  );
}
