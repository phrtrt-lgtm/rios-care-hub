import React, { useRef, useState } from 'react';
import { Camera, Video, FolderOpen, Paperclip, Loader2, FileText } from 'lucide-react';
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
  const videoInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const { takePhoto, pickMedia, webPathToFile } = useNativeMedia();

  const maxSize = maxSizeMB * 1024 * 1024;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleTakePhoto = async () => {
    if (isNative) {
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
    } else {
      photoInputRef.current?.click();
    }
  };

  const handleRecordVideo = () => {
    videoInputRef.current?.click();
  };

  const handlePickFromGallery = async () => {
    if (isNative) {
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
    } else {
      fileInputRef.current?.click();
    }
  };

  const handlePickDocument = async () => {
    if (isNative) {
      setLoading(true);
      try {
        const { FilePicker } = await import('@capawesome/capacitor-file-picker');
        const result = await FilePicker.pickFiles({
          limit: multiple ? 10 : 1,
          readData: false,
        });

        if (result.files.length > 0) {
          const files: File[] = [];
          for (const pickedFile of result.files) {
            const path = pickedFile.path || '';
            if (!path) continue;
            const file = await webPathToFile(
              path,
              pickedFile.name || `documento_${Date.now()}`,
              pickedFile.mimeType || 'application/octet-stream'
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
        console.error('Error picking document:', error);
        if (!error.message?.includes('cancelled') && !error.message?.includes('canceled') && !error.message?.includes('aborted')) {
          toast.error('Erro ao selecionar documento');
        }
      } finally {
        setLoading(false);
      }
    } else {
      documentInputRef.current?.click();
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

  if (isNative) {
    return (
      <>
        <input
          type="file"
          ref={videoInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept="video/*"
          capture="environment"
        />
        <input
          type="file"
          ref={photoInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept="image/*"
          capture="environment"
        />
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          multiple={multiple}
          accept={accept}
        />
        <input
          type="file"
          ref={documentInputRef}
          onChange={handleFileChange}
          className="hidden"
          multiple={multiple}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.ppt,.pptx"
        />
        
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
            <DropdownMenuItem onClick={handlePickDocument} className="cursor-pointer">
              <FileText className="h-4 w-4 mr-2 text-orange-500" />
              Documento
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    );
  }

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
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
