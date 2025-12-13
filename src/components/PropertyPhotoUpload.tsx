import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ImageCropDialog } from "./ImageCropDialog";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { cn } from "@/lib/utils";

interface PropertyPhotoUploadProps {
  propertyId: string;
  currentPhotoUrl?: string | null;
  propertyName: string;
  onUploadComplete?: (url: string) => void;
}

export function PropertyPhotoUpload({ 
  propertyId, 
  currentPhotoUrl, 
  propertyName, 
  onUploadComplete 
}: PropertyPhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();

  const processFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Arquivo inválido",
        description: "Por favor, selecione uma imagem.",
        variant: "destructive",
      });
      return;
    }
    
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage(reader.result as string);
      setCropDialogOpen(true);
    };
    reader.readAsDataURL(file);
  }, [toast]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  }, [processFile]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const uploadPhoto = async (croppedImageBlob: Blob) => {
    try {
      setUploading(true);

      const fileExt = 'jpg';
      const filePath = `${propertyId}/${Date.now()}.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('property-photos')
        .upload(filePath, croppedImageBlob, { upsert: true });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('property-photos')
        .getPublicUrl(filePath);

      // Update property
      const { error: updateError } = await supabase
        .from('properties')
        .update({ cover_photo_url: publicUrl })
        .eq('id', propertyId);

      if (updateError) {
        throw updateError;
      }

      toast({
        title: "Foto atualizada!",
        description: "A foto de capa foi atualizada com sucesso.",
      });

      onUploadComplete?.(publicUrl);
      setCropDialogOpen(false);
      setSelectedImage(null);
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar foto",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative rounded-lg overflow-hidden transition-all duration-200",
          isDragging && "ring-2 ring-primary ring-offset-2"
        )}
      >
        <AspectRatio ratio={16 / 9} className="bg-muted">
          {currentPhotoUrl ? (
            <img 
              src={currentPhotoUrl} 
              alt={propertyName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className={cn(
              "w-full h-full flex flex-col items-center justify-center gap-2 transition-colors",
              isDragging ? "bg-primary/10" : "bg-muted"
            )}>
              <ImageIcon className={cn(
                "h-8 w-8 transition-colors",
                isDragging ? "text-primary" : "text-muted-foreground"
              )} />
              <span className="text-xs text-muted-foreground">
                Arraste uma foto aqui
              </span>
            </div>
          )}
          {isDragging && currentPhotoUrl && (
            <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
              <span className="text-sm font-medium text-primary bg-background/90 px-3 py-1 rounded">
                Solte para trocar
              </span>
            </div>
          )}
        </AspectRatio>
      </div>
      
      <div className="mt-3">
        <input
          type="file"
          id={`property-photo-${propertyId}`}
          accept="image/*"
          onChange={handleFileSelect}
          disabled={uploading}
          className="hidden"
        />
        <label htmlFor={`property-photo-${propertyId}`}>
          <Button
            variant="outline"
            size="sm"
            disabled={uploading}
            asChild
            className="w-full"
          >
            <span className="cursor-pointer">
              {uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {uploading ? "Enviando..." : currentPhotoUrl ? "Alterar Foto" : "Adicionar Foto"}
            </span>
          </Button>
        </label>
      </div>

      {selectedImage && (
        <ImageCropDialog
          open={cropDialogOpen}
          imageSrc={selectedImage}
          onClose={() => {
            setCropDialogOpen(false);
            setSelectedImage(null);
          }}
          onCropComplete={uploadPhoto}
          loading={uploading}
          aspect={16 / 9}
          cropShape="rect"
        />
      )}
    </>
  );
}
