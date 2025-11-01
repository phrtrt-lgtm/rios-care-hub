import { FileIcon, ImageIcon, FileTextIcon, Download } from "lucide-react";
import { Card } from "@/components/ui/card";

interface AttachmentBubbleProps {
  id: string;
  file_url: string;
  file_name?: string;
  file_type?: string;
  size_bytes?: number;
}

export function AttachmentBubble({
  file_url,
  file_name,
  file_type,
  size_bytes
}: AttachmentBubbleProps) {
  const isImage = file_type?.startsWith('image/');
  const isPDF = file_type === 'application/pdf';
  
  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isImage) {
    return (
      <a 
        href={file_url} 
        target="_blank" 
        rel="noopener noreferrer"
        className="block"
        aria-label={`Ver imagem ${file_name || 'anexada'}`}
      >
        <img 
          src={file_url} 
          alt={file_name || 'Anexo'} 
          className="max-w-[280px] rounded-lg border border-border hover:opacity-90 transition-opacity"
          loading="lazy"
        />
        {file_name && (
          <div className="text-xs text-muted-foreground mt-1">
            {file_name} {size_bytes && `(${formatSize(size_bytes)})`}
          </div>
        )}
      </a>
    );
  }

  if (isPDF) {
    return (
      <Card className="p-3 max-w-[280px]">
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
    <Card className="p-3 max-w-[280px]">
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
