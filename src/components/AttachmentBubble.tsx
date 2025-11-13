import { FileIcon, ImageIcon, FileTextIcon, Download, Eye } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface AttachmentBubbleProps {
  id: string;
  file_url: string;
  file_name?: string;
  file_type?: string;
  size_bytes?: number;
  onPreview?: (url: string, name: string) => void;
}

export function AttachmentBubble({
  file_url,
  file_name,
  file_type,
  size_bytes,
  onPreview
}: AttachmentBubbleProps) {
  // TIFF files are not supported by browsers, treat as downloads
  const isTiff = file_type === 'image/tiff' || file_type === 'image/tif';
  const isImage = file_type?.startsWith('image/') && !isTiff;
  const isPDF = file_type === 'application/pdf';
  
  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isImage) {
    return (
      <div className="relative group">
        <div 
          onClick={() => onPreview?.(file_url, file_name || 'Imagem')}
          className="cursor-pointer relative overflow-hidden rounded-lg border border-border hover:border-primary transition-colors"
        >
          <img 
            src={file_url} 
            alt={file_name || 'Anexo'} 
            className="w-full h-32 object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
            <Eye className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        {file_name && (
          <div className="text-xs text-muted-foreground mt-1 truncate">
            {file_name} {size_bytes && `(${formatSize(size_bytes)})`}
          </div>
        )}
      </div>
    );
  }

  if (isPDF) {
    return (
      <Card className="p-3 w-full">
        <div className="flex items-center gap-3">
          <FileTextIcon className="h-8 w-8 text-destructive flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">
              {file_name || 'Documento PDF'}
            </div>
            {size_bytes && (
              <div className="text-xs text-muted-foreground">
                {formatSize(size_bytes)}
              </div>
            )}
          </div>
          <a
            href={file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0"
            aria-label="Abrir PDF"
          >
            <Download className="h-5 w-5 text-primary hover:text-primary/80" />
          </a>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-3 w-full">
      <div className="flex items-center gap-3">
        <FileIcon className="h-8 w-8 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">
            {file_name || 'Arquivo'}
          </div>
          {size_bytes && (
            <div className="text-xs text-muted-foreground">
              {formatSize(size_bytes)}
            </div>
          )}
        </div>
        <a
          href={file_url}
          download={file_name}
          className="flex-shrink-0"
          aria-label="Baixar arquivo"
        >
          <Download className="h-5 w-5 text-primary hover:text-primary/80" />
        </a>
      </div>
    </Card>
  );
}
