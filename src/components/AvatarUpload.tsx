import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ImageCropDialog } from "./ImageCropDialog";

interface AvatarUploadProps {
  userId: string;
  currentPhotoUrl?: string | null;
  userName: string;
  onUploadComplete?: (url: string) => void;
}

export function AvatarUpload({ userId, currentPhotoUrl, userName, onUploadComplete }: AvatarUploadProps) {
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

  const uploadAvatar = async (croppedImageBlob: Blob) => {
    try {
      setUploading(true);

      const fileExt = 'jpg';
      const filePath = `${userId}/avatar.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, croppedImageBlob, { upsert: true });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Update profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ photo_url: publicUrl })
        .eq('id', userId);

      if (updateError) {
        throw updateError;
      }

      toast({
        title: "Avatar atualizado!",
        description: "Sua foto de perfil foi atualizada com sucesso.",
      });

      onUploadComplete?.(publicUrl);
      setCropDialogOpen(false);
      setSelectedImage(null);
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar avatar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const initials = userName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <>
      <div className="flex flex-col items-center gap-4">
        <Avatar className="h-24 w-24">
          <AvatarImage src={currentPhotoUrl || undefined} alt={userName} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        
        <div>
          <input
            type="file"
            id="avatar-upload"
            accept="image/*"
            onChange={handleFileSelect}
            disabled={uploading}
            className="hidden"
          />
          <label htmlFor="avatar-upload">
            <Button
              variant="outline"
              size="sm"
              disabled={uploading}
              asChild
            >
              <span className="cursor-pointer">
                {uploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                {uploading ? "Enviando..." : "Alterar Foto"}
              </span>
            </Button>
          </label>
        </div>
      </div>

      {selectedImage && (
        <ImageCropDialog
          open={cropDialogOpen}
          imageSrc={selectedImage}
          onClose={() => {
            setCropDialogOpen(false);
            setSelectedImage(null);
          }}
          onCropComplete={uploadAvatar}
          loading={uploading}
        />
      )}
    </>
  );
}
