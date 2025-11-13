import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { useState, useEffect } from "react";
import { AuthenticatedImage, AuthenticatedVideo } from "./AuthenticatedMedia";

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

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, open]);

  const currentItem = items[currentIndex];
  const isVideo = currentItem?.file_type?.startsWith('video/');
  const isImage = currentItem?.file_type?.startsWith('image/');

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
  };

  const handleDownload = async () => {
    try {
      // Import supabase here to get auth token
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        console.error('Sessão não encontrada');
        return;
      }

      const response = await fetch(currentItem.file_url, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = currentItem.file_name || `arquivo-${currentIndex + 1}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Erro ao baixar arquivo:', error);
    }
  };

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
  }, [open]);

  if (!currentItem) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={true}>
      <DialogContent className="max-w-[100vw] max-h-[100vh] w-full h-full p-0 bg-black/95 border-none overflow-hidden" onInteractOutside={(e) => e.preventDefault()}>
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          {/* Botão Fechar */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 z-50 text-white hover:bg-white/20"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-6 w-6" />
          </Button>

          {/* Botão Download */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-16 z-50 text-white hover:bg-white/20"
            onClick={handleDownload}
          >
            <Download className="h-6 w-6" />
          </Button>

          {/* Navegação Esquerda */}
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

          {/* Conteúdo Principal */}
          <div className="w-full h-full flex items-center justify-center p-4 md:p-16">
            {isImage && (
              <AuthenticatedImage
                src={currentItem.file_url}
                alt={currentItem.file_name || 'Imagem'}
                className="max-w-full max-h-full w-auto h-auto object-contain"
              />
            )}
            {isVideo && (
              <AuthenticatedVideo
                src={currentItem.file_url}
                controls
                className="max-w-full max-h-full w-auto h-auto"
                autoPlay
              />
            )}
            {!isImage && !isVideo && (
              <div className="text-white text-center">
                <p className="mb-4">Visualização não disponível para este tipo de arquivo</p>
                <Button onClick={handleDownload} variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Baixar Arquivo
                </Button>
              </div>
            )}
          </div>

          {/* Navegação Direita */}
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

          {/* Contador */}
          {items.length > 1 && (
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50 bg-black/50 text-white px-4 py-2 rounded-full">
              {currentIndex + 1} / {items.length}
            </div>
          )}

          {/* Thumbnails */}
          {items.length > 1 && (
            <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 z-50 flex gap-2 max-w-[80vw] overflow-x-auto py-2 px-4 bg-black/30 rounded-lg">
              {items.map((item, index) => (
                <button
                  key={item.id}
                  onClick={() => setCurrentIndex(index)}
                  className={`flex-shrink-0 w-16 h-16 rounded overflow-hidden border-2 transition-all ${
                    index === currentIndex ? 'border-primary scale-110' : 'border-white/30 hover:border-white/60'
                  }`}
                >
                  {item.file_type?.startsWith('image/') ? (
                    <img
                      src={item.file_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : item.file_type?.startsWith('video/') ? (
                    <div className="w-full h-full bg-gray-800 flex items-center justify-center text-white text-xs">
                      VIDEO
                    </div>
                  ) : (
                    <div className="w-full h-full bg-gray-700 flex items-center justify-center text-white text-xs">
                      FILE
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
