import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ImageCropDialog } from "./ImageCropDialog";
import { AspectRatio } from "@/components/ui/aspect-ratio";

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
  const { toast } = useToast();

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) {
      return;
    }

    const file = event.target.files[0];
    const reader = new FileReader();
    
    reader.onload = () => {
      setSelectedImage(reader.result as string);
      setCropDialogOpen(true);
    };
    
    reader.readAsDataURL(file);
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
      <AspectRatio ratio={16 / 9} className="bg-muted rounded-lg overflow-hidden">
        {currentPhotoUrl ? (
          <img 
            src={currentPhotoUrl} 
            alt={propertyName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
      </AspectRatio>
      
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
