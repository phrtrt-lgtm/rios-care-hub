import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useMediaCache } from "@/hooks/useMediaCache";
import { MediaThumbnail } from "./MediaThumbnail";
import { Skeleton } from "@/components/ui/skeleton";
import { detectMediaKind } from "@/lib/mediaType";

interface MediaItem {
  id: string;
  file_url: string;
  file_name?: string | null;
  file_type?: string | null;
  size_bytes?: number | null;
}

interface MediaGalleryProps {
  items: MediaItem[];
  initialIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const MediaGallery = ({ items, initialIndex, open, onOpenChange }: MediaGalleryProps) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [currentBlobUrl, setCurrentBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { loadMedia, preloadMedia, getCachedUrl } = useMediaCache();

  const currentItem = items[currentIndex];
  const currentKind = currentItem
    ? detectMediaKind(currentItem.file_type, currentItem.file_name, currentItem.file_url)
    : 'other';
  const isVideo = currentKind === 'video';
  const isImage = currentKind === 'image';
  const isPDF = currentKind === 'pdf';

  // Memoize items URLs to avoid unnecessary re-renders
  const itemUrls = useMemo(() => items.map(item => item.file_url), [items]);

  // Reset index when dialog opens - use a ref to track previous open state
  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
      // Preload all items when gallery opens
      if (itemUrls.length > 0) {
        preloadMedia(itemUrls);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Load current item
  useEffect(() => {
    if (!open || !currentItem) return;

    // PDFs use the original URL directly in iframe (blob URLs don't work in iframes)
    if (currentItem.file_type === 'application/pdf') {
      setCurrentBlobUrl(currentItem.file_url);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const load = async () => {
      // Check cache first
      const cached = getCachedUrl(currentItem.file_url);
      if (cached) {
        if (!cancelled) {
          setCurrentBlobUrl(cached);
          setLoading(false);
        }
        return;
      }

      const blobUrl = await loadMedia(currentItem.file_url);
      if (!cancelled) {
        setCurrentBlobUrl(blobUrl);
        setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [open, currentItem, loadMedia, getCachedUrl]);

  // Preload adjacent items when index changes
  useEffect(() => {
    if (!open || items.length <= 1) return;

    const adjacentUrls: string[] = [];
    if (currentIndex > 0) {
      adjacentUrls.push(items[currentIndex - 1].file_url);
    }
    if (currentIndex < items.length - 1) {
      adjacentUrls.push(items[currentIndex + 1].file_url);
    }

    if (adjacentUrls.length > 0) {
      preloadMedia(adjacentUrls);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentIndex]);

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
  }, [items.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
  }, [items.length]);

  const handleDownload = useCallback(async () => {
    if (!currentItem || !currentBlobUrl) return;

    try {
      const a = document.createElement('a');
      a.href = currentBlobUrl;
      a.download = currentItem.file_name || `arquivo-${currentIndex + 1}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error('Erro ao baixar arquivo:', error);
    }
  }, [currentItem, currentBlobUrl, currentIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;
      
      if (e.key === 'ArrowLeft') {
        goToPrevious();
      } else if (e.key === 'ArrowRight') {
        goToNext();
      } else if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, goToPrevious, goToNext, onOpenChange]);

  if (!currentItem) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={true}>
      <DialogContent 
        className="max-w-[100vw] max-h-[100vh] w-full h-full p-0 bg-black/95 border-none overflow-hidden" 
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          {/* Close Button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 z-50 text-white hover:bg-white/20"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-6 w-6" />
          </Button>

          {/* Download Button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-16 z-50 text-white hover:bg-white/20"
            onClick={handleDownload}
            disabled={!currentBlobUrl}
          >
            <Download className="h-6 w-6" />
          </Button>

          {/* Previous Navigation */}
          {items.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 z-50 text-white hover:bg-white/20 h-12 w-12"
              onClick={goToPrevious}
            >
              <ChevronLeft className="h-8 w-8" />
            </Button>
          )}

          {/* Main Content */}
          <div className="w-full h-full flex items-center justify-center p-4 md:p-16">
            {loading ? (
              <Skeleton className="w-[80vw] h-[60vh] max-w-4xl" />
            ) : currentBlobUrl ? (
              <>
                {isImage && (
                  <img
                    src={currentBlobUrl}
                    alt={currentItem.file_name || 'Imagem'}
                    className="max-w-full max-h-full w-auto h-auto object-contain"
                  />
                )}
                {isVideo && (
                  <video
                    src={currentBlobUrl}
                    controls
                    className="max-w-full max-h-full w-auto h-auto"
                    autoPlay
                  />
                )}
                {isPDF && (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                    <object
                      data={currentBlobUrl}
                      type="application/pdf"
                      className="w-full rounded bg-white"
                      style={{ height: '72vh', border: 'none' }}
                    >
                      {/* Fallback for browsers that block PDF in object tags */}
                      <div className="text-white text-center p-8">
                        <p className="mb-4 text-sm text-white/70">Seu navegador não suporta pré-visualização de PDF inline.</p>
                        <Button
                          onClick={() => window.open(currentBlobUrl, '_blank')}
                          variant="outline"
                          className="mr-2"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Abrir PDF
                        </Button>
                      </div>
                    </object>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-white/70 hover:text-white"
                      onClick={() => window.open(currentBlobUrl, '_blank')}
                    >
                      Abrir em nova aba
                    </Button>
                  </div>
                )}
                {!isImage && !isVideo && !isPDF && (
                  <div className="text-white text-center">
                    <p className="mb-4">Visualização não disponível para este tipo de arquivo</p>
                    <Button onClick={handleDownload} variant="outline">
                      <Download className="h-4 w-4 mr-2" />
                      Baixar Arquivo
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-white text-center">
                <p className="mb-4">Erro ao carregar mídia</p>
                <Button onClick={() => loadMedia(currentItem.file_url)} variant="outline">
                  Tentar novamente
                </Button>
              </div>
            )}
          </div>

          {/* Next Navigation */}
          {items.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 z-50 text-white hover:bg-white/20 h-12 w-12"
              onClick={goToNext}
            >
              <ChevronRight className="h-8 w-8" />
            </Button>
          )}

          {/* Counter */}
          {items.length > 1 && (
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50 bg-black/50 text-white px-4 py-2 rounded-full">
              {currentIndex + 1} / {items.length}
            </div>
          )}

          {/* Thumbnails */}
          {items.length > 1 && (
            <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 z-50 flex gap-2 max-w-[80vw] overflow-x-auto py-2 px-4 bg-black/30 rounded-lg">
              {items.map((item, index) => (
                <MediaThumbnail
                  key={item.id}
                  src={item.file_url}
                  fileType={item.file_type}
                  fileName={item.file_name}
                  isSelected={index === currentIndex}
                  onClick={() => setCurrentIndex(index)}
                  size="md"
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
