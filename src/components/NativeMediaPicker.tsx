import React, { useRef, useState } from 'react';
import { Camera, Video, FolderOpen, Paperclip, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Capacitor } from '@capacitor/core';
import { useNativeMedia } from '@/hooks/useNativeMedia';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NativeMediaPickerProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  accept?: string;
  multiple?: boolean;
  maxSizeMB?: number;
  className?: string;
  buttonVariant?: "default" | "outline" | "ghost" | "secondary";
  buttonSize?: "default" | "sm" | "lg" | "icon";
  iconOnly?: boolean;
}

export function NativeMediaPicker({
  onFilesSelected,
  disabled = false,
  accept = "image/*,video/*,audio/*,.pdf,.doc,.docx",
  multiple = true,
  maxSizeMB = 100,
  className,
  buttonVariant = "outline",
  buttonSize = "icon",
  iconOnly = true,
}: NativeMediaPickerProps) {
  const isNative = Capacitor.isNativePlatform();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const { takePhoto, recordVideo, pickMedia, webPathToFile } = useNativeMedia();

  const maxSize = maxSizeMB * 1024 * 1024;

  // Handle web file input
  const handleWebFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const validFiles: File[] = [];
    for (const file of Array.from(files)) {
      if (file.size > maxSize) {
        toast.error(`${file.name} excede ${maxSizeMB}MB`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      onFilesSelected(validFiles);
    }
    
    e.target.value = '';
  };

  // Handle native photo
  const handleTakePhoto = async () => {
    setLoading(true);
    try {
      const result = await takePhoto();
      if (result) {
        const file = await webPathToFile(
          result.webPath, 
          `photo_${Date.now()}.${result.format}`, 
          result.mimeType
        );
        onFilesSelected([file]);
      }
    } catch (error: any) {
      console.error('Error taking photo:', error);
      toast.error('Erro ao tirar foto');
    } finally {
      setLoading(false);
    }
  };

  // Handle native video
  const handleRecordVideo = async () => {
    setLoading(true);
    try {
      const result = await recordVideo();
      if (result) {
        const file = await webPathToFile(
          result.webPath, 
          `video_${Date.now()}.${result.format}`, 
          result.mimeType
        );
        onFilesSelected([file]);
      }
    } catch (error: any) {
      console.error('Error recording video:', error);
      toast.error('Erro ao gravar vídeo');
    } finally {
      setLoading(false);
    }
  };

  // Handle native gallery
  const handlePickFromGallery = async () => {
    setLoading(true);
    try {
      const results = await pickMedia(multiple ? 30 : 1);
      if (results.length > 0) {
        const files: File[] = [];
        for (const result of results) {
          const file = await webPathToFile(
            result.webPath, 
            `${result.isVideo ? 'video' : 'image'}_${Date.now()}.${result.format}`, 
            result.mimeType
          );
          if (file.size <= maxSize) {
            files.push(file);
          } else {
            toast.error(`${file.name} excede ${maxSizeMB}MB`);
          }
        }
        if (files.length > 0) {
          onFilesSelected(files);
        }
      }
    } catch (error: any) {
      console.error('Error picking from gallery:', error);
      toast.error('Erro ao selecionar arquivos');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Button
        variant={buttonVariant}
        size={buttonSize}
        disabled
        className={className}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  // Native: Show dropdown menu with options
  if (isNative) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={buttonVariant}
            size={buttonSize}
            disabled={disabled}
            className={className}
            title="Anexar arquivo"
          >
            <Paperclip className="h-4 w-4" />
            {!iconOnly && <span className="ml-2">Anexar</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48 bg-popover">
          <DropdownMenuItem onClick={handleTakePhoto} className="cursor-pointer">
            <Camera className="h-4 w-4 mr-2 text-primary" />
            Tirar foto
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleRecordVideo} className="cursor-pointer">
            <Video className="h-4 w-4 mr-2 text-red-500" />
            Gravar vídeo
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handlePickFromGallery} className="cursor-pointer">
            <FolderOpen className="h-4 w-4 mr-2 text-primary" />
            Galeria
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Web: Show file input
  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleWebFileChange}
        className="hidden"
        multiple={multiple}
        accept={accept}
      />
      <Button
        variant={buttonVariant}
        size={buttonSize}
        disabled={disabled}
        className={className}
        onClick={() => fileInputRef.current?.click()}
        title="Anexar arquivo"
      >
        <Paperclip className="h-4 w-4" />
        {!iconOnly && <span className="ml-2">Anexar</span>}
      </Button>
    </>
  );
}
