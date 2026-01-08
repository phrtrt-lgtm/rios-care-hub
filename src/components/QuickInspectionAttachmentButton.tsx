import { useRef, useState } from "react";
import { Paperclip, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { processFileForUpload } from "@/lib/fileUpload";

interface QuickInspectionAttachmentButtonProps {
  inspectionId: string;
  onSuccess?: () => void;
}

export function QuickInspectionAttachmentButton({ inspectionId, onSuccess }: QuickInspectionAttachmentButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading) {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);

    try {
      // Process and upload each file
      for (const file of Array.from(files)) {
        // Process file (compress if video)
        const processedFile = await processFileForUpload(file, (progress) => {
          console.log('[QuickInspectionAttachment]', progress.message);
        });

        // Upload to storage
        const fileExt = processedFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `inspections/${inspectionId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('cleaning-inspections')
          .upload(filePath, processedFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('cleaning-inspections')
          .getPublicUrl(filePath);

        // Create attachment record
        const { error: attachmentError } = await supabase
          .from('cleaning_inspection_attachments')
          .insert({
            inspection_id: inspectionId,
            file_url: publicUrl,
            file_name: processedFile.name,
            file_type: processedFile.type,
            size_bytes: processedFile.size,
          });

        if (attachmentError) throw attachmentError;
      }

      toast.success("Anexo adicionado à vistoria!");
      onSuccess?.();
    } catch (error) {
      console.error("Error uploading inspection attachment:", error);
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
        onClick={(e) => e.stopPropagation()}
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
        title="Adicionar anexo à vistoria"
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
