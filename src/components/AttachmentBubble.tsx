import { FileIcon, FileTextIcon, Download, Eye, Play, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useState, useEffect } from "react";
import { useMediaCache, generateVideoThumbnail } from "@/hooks/useMediaCache";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { resolveMimeType } from "@/lib/mediaType";

interface AttachmentBubbleProps {
  id: string;
  file_url: string;
  file_name?: string;
  file_type?: string;
  size_bytes?: number;
  onPreview?: (url: string, name: string) => void;
  /** Optional delete callback. If provided, shows a trash icon with confirmation. */
  onDelete?: () => void | Promise<void>;
}

export function AttachmentBubble({
  file_url,
  file_name,
  file_type,
  size_bytes,
  onPreview,
  onDelete
}: AttachmentBubbleProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleConfirmDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete();
      setConfirmOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const DeleteOverlay = onDelete ? (
    <Button
      type="button"
      size="sm"
      variant="destructive"
      onClick={(e) => {
        e.stopPropagation();
        setConfirmOpen(true);
      }}
      className="absolute top-1 right-1 h-7 w-7 p-0 opacity-90 hover:opacity-100 z-10"
      title="Excluir anexo"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  ) : null;

  const ConfirmModal = onDelete ? (
    <ConfirmationDialog
      open={confirmOpen}
      onOpenChange={setConfirmOpen}
      title="Excluir anexo?"
      description={
        <div className="space-y-2">
          <p>Esta ação é permanente e não pode ser desfeita.</p>
          {file_name && (
            <p className="text-xs">
              Arquivo: <span className="font-mono">{file_name}</span>
            </p>
          )}
        </div>
      }
      confirmLabel="Excluir"
      variant="destructive"
      onConfirm={handleConfirmDelete}
      loading={deleting}
    />
  ) : null;

  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { loadMedia, getCachedUrl } = useMediaCache();

  // Resolve mime type from extension when missing/generic (legacy attachments)
  const resolvedType = resolveMimeType(file_type, file_name, file_url);

  // TIFF files are not supported by browsers, treat as downloads
  const isTiff = resolvedType === 'image/tiff' || resolvedType === 'image/tif';
  const isImage = resolvedType.startsWith('image/') && !isTiff;
  const isVideo = resolvedType.startsWith('video/');
  const isPDF = resolvedType === 'application/pdf';
  
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
        {DeleteOverlay}
        <div 
          onClick={() => onPreview?.(file_url, isVideo ? 'Vídeo' : 'Imagem')}
          className="cursor-pointer relative overflow-hidden rounded-lg border border-border hover:border-primary transition-colors"
        >
          {loading ? (
            <Skeleton className="w-full h-32" />
          ) : thumbnailUrl ? (
            <img 
              src={thumbnailUrl} 
              alt="Anexo" 
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
        {size_bytes && (
          <div className="text-xs text-muted-foreground mt-1">
            {formatSize(size_bytes)}
          </div>
        )}
        {ConfirmModal}
      </div>
    );
  }

  if (isPDF) {
    return (
      <div className="relative group">
        {DeleteOverlay}
        <div
          onClick={() => onPreview?.(file_url, 'PDF')}
          className="cursor-pointer relative overflow-hidden rounded-lg border border-border hover:border-primary transition-colors"
        >
          <div className="w-full h-32 bg-muted flex flex-col items-center justify-center gap-2 relative">
            <FileTextIcon className="h-10 w-10 text-destructive" />
            <span className="text-xs font-semibold text-destructive uppercase tracking-wider">PDF</span>
          </div>
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
            <Eye className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        {size_bytes && (
          <div className="text-xs text-muted-foreground mt-1">
            {formatSize(size_bytes)}
          </div>
        )}
        {ConfirmModal}
      </div>
    );
  }

  return (
    <div className="relative group w-full">
      {DeleteOverlay}
      <Card className="p-3 w-full">
        <div className="flex items-center gap-3">
          <FileIcon className="h-8 w-8 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">
              Arquivo anexo
            </div>
            {size_bytes && (
              <div className="text-xs text-muted-foreground">
                {formatSize(size_bytes)}
              </div>
            )}
          </div>
          <a
            href={file_url}
            download="anexo"
            className="flex-shrink-0"
            aria-label="Baixar arquivo"
          >
            <Download className="h-5 w-5 text-primary hover:text-primary/80" />
          </a>
        </div>
      </Card>
      {ConfirmModal}
    </div>
  );
}
