import { FileIcon, FileTextIcon, Download, Eye, Play } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useState, useEffect } from "react";
import { useMediaCache, generateVideoThumbnail } from "@/hooks/useMediaCache";
import { Skeleton } from "@/components/ui/skeleton";

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
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { loadMedia, getCachedUrl } = useMediaCache();

  // TIFF files are not supported by browsers, treat as downloads
  const isTiff = file_type === 'image/tiff' || file_type === 'image/tif';
  const isImage = file_type?.startsWith('image/') && !isTiff;
  const isVideo = file_type?.startsWith('video/');
  const isPDF = file_type === 'application/pdf';
  
  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Load thumbnail for images and videos
  useEffect(() => {
    if (!isImage && !isVideo) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadThumbnail = async () => {
      // Check cache first
      const cached = getCachedUrl(file_url);
      if (cached) {
        if (isVideo) {
          const thumb = await generateVideoThumbnail(cached);
          if (!cancelled) {
            setThumbnailUrl(thumb || null);
            setLoading(false);
          }
        } else {
          if (!cancelled) {
            setThumbnailUrl(cached);
            setLoading(false);
          }
        }
        return;
      }

      // Load the media
      const blobUrl = await loadMedia(file_url);
      if (cancelled || !blobUrl) {
        if (!cancelled) setLoading(false);
        return;
      }

      if (isVideo) {
        const thumb = await generateVideoThumbnail(blobUrl);
        if (!cancelled) {
          setThumbnailUrl(thumb || null);
          setLoading(false);
        }
      } else {
        if (!cancelled) {
          setThumbnailUrl(blobUrl);
          setLoading(false);
        }
      }
    };

    loadThumbnail();

    return () => {
      cancelled = true;
    };
  }, [file_url, isImage, isVideo, loadMedia, getCachedUrl]);

  if (isImage || isVideo) {
    return (
      <div className="relative group">
        <div 
          onClick={() => onPreview?.(file_url, file_name || (isVideo ? 'Vídeo' : 'Imagem'))}
          className="cursor-pointer relative overflow-hidden rounded-lg border border-border hover:border-primary transition-colors"
        >
          {loading ? (
            <Skeleton className="w-full h-32" />
          ) : thumbnailUrl ? (
            <img 
              src={thumbnailUrl} 
              alt={file_name || 'Anexo'} 
              className="w-full h-32 object-cover"
            />
          ) : (
            <div className="w-full h-32 bg-muted flex items-center justify-center">
              {isVideo ? (
                <Play className="h-8 w-8 text-muted-foreground" />
              ) : (
                <FileIcon className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
            {isVideo ? (
              <Play className="h-8 w-8 text-white opacity-70 group-hover:opacity-100 transition-opacity" fill="white" />
            ) : (
              <Eye className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
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
