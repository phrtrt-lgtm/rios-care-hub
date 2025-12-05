import { useState, useEffect, memo } from "react";
import { Play, FileIcon } from "lucide-react";
import { useMediaCache, generateVideoThumbnail } from "@/hooks/useMediaCache";
import { Skeleton } from "@/components/ui/skeleton";

interface MediaThumbnailProps {
  src: string;
  fileType?: string | null;
  fileName?: string | null;
  isSelected?: boolean;
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "w-12 h-12",
  md: "w-16 h-16",
  lg: "w-24 h-24",
};

export const MediaThumbnail = memo(({ 
  src, 
  fileType, 
  fileName,
  isSelected = false, 
  onClick,
  size = "md"
}: MediaThumbnailProps) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { loadMedia, getCachedUrl } = useMediaCache();

  const isVideo = fileType?.startsWith('video/');
  const isImage = fileType?.startsWith('image/');

  useEffect(() => {
    let cancelled = false;

    const loadThumbnail = async () => {
      // Check cache first
      const cached = getCachedUrl(src);
      if (cached) {
        if (isVideo) {
          // Generate thumbnail from cached video
          const thumb = await generateVideoThumbnail(cached);
          if (!cancelled) {
            setThumbnailUrl(thumb || cached);
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
      const blobUrl = await loadMedia(src);
      if (cancelled || !blobUrl) {
        if (!cancelled) setLoading(false);
        return;
      }

      if (isVideo) {
        // Generate thumbnail from video
        const thumb = await generateVideoThumbnail(blobUrl);
        if (!cancelled) {
          setThumbnailUrl(thumb || null);
          setLoading(false);
        }
      } else if (isImage) {
        if (!cancelled) {
          setThumbnailUrl(blobUrl);
          setLoading(false);
        }
      } else {
        if (!cancelled) setLoading(false);
      }
    };

    loadThumbnail();

    return () => {
      cancelled = true;
    };
  }, [src, isVideo, isImage, loadMedia, getCachedUrl]);

  const sizeClass = sizeClasses[size];

  if (loading) {
    return (
      <div className={`${sizeClass} rounded overflow-hidden`}>
        <Skeleton className="w-full h-full" />
      </div>
    );
  }

  if (!isImage && !isVideo) {
    return (
      <button
        onClick={onClick}
        className={`${sizeClass} rounded overflow-hidden border-2 transition-all flex items-center justify-center bg-muted ${
          isSelected ? 'border-primary scale-110' : 'border-border/30 hover:border-border/60'
        }`}
      >
        <FileIcon className="w-6 h-6 text-muted-foreground" />
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`relative ${sizeClass} rounded overflow-hidden border-2 transition-all flex-shrink-0 ${
        isSelected ? 'border-primary scale-110' : 'border-border/30 hover:border-border/60'
      }`}
    >
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={fileName || ''}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full bg-muted flex items-center justify-center">
          {isVideo ? (
            <Play className="w-6 h-6 text-muted-foreground" />
          ) : (
            <FileIcon className="w-6 h-6 text-muted-foreground" />
          )}
        </div>
      )}
      {isVideo && thumbnailUrl && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <Play className="w-6 h-6 text-white" fill="white" />
        </div>
      )}
    </button>
  );
});

MediaThumbnail.displayName = "MediaThumbnail";
