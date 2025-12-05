import React, { useEffect, useState } from "react";
import { useMediaCache } from "@/hooks/useMediaCache";
import { Skeleton } from "@/components/ui/skeleton";

interface AuthenticatedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

export const AuthenticatedImage = ({ src, alt, className, ...props }: AuthenticatedImageProps) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { loadMedia, getCachedUrl } = useMediaCache();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(false);

      // Check cache first
      const cached = getCachedUrl(src);
      if (cached) {
        if (!cancelled) {
          setImageSrc(cached);
          setLoading(false);
        }
        return;
      }

      const blobUrl = await loadMedia(src);
      if (!cancelled) {
        if (blobUrl) {
          setImageSrc(blobUrl);
        } else {
          setError(true);
        }
        setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [src, loadMedia, getCachedUrl]);

  if (loading) {
    return <Skeleton className={className || "w-full h-full"} />;
  }

  if (error || !imageSrc) {
    return (
      <div className={`flex items-center justify-center bg-muted text-muted-foreground text-sm ${className || 'w-full h-full'}`}>
        Erro ao carregar
      </div>
    );
  }

  return <img src={imageSrc} alt={alt} className={className} {...props} />;
};

interface AuthenticatedVideoProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  src: string;
  posterSrc?: string;
}

export const AuthenticatedVideo = ({ src, posterSrc, className, ...props }: AuthenticatedVideoProps) => {
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
  const [posterBlobUrl, setPosterBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { loadMedia, getCachedUrl } = useMediaCache();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(false);

      // Check video cache first
      const cachedVideo = getCachedUrl(src);
      if (cachedVideo) {
        if (!cancelled) {
          setVideoBlobUrl(cachedVideo);
        }
      } else {
        const videoUrl = await loadMedia(src);
        if (!cancelled) {
          if (videoUrl) {
            setVideoBlobUrl(videoUrl);
          } else {
            setError(true);
          }
        }
      }

      // Load poster if available
      if (posterSrc) {
        const cachedPoster = getCachedUrl(posterSrc);
        if (cachedPoster) {
          if (!cancelled) {
            setPosterBlobUrl(cachedPoster);
          }
        } else {
          const posterUrl = await loadMedia(posterSrc);
          if (!cancelled && posterUrl) {
            setPosterBlobUrl(posterUrl);
          }
        }
      }

      if (!cancelled) {
        setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [src, posterSrc, loadMedia, getCachedUrl]);

  if (loading) {
    return <Skeleton className={className || "w-full h-48"} />;
  }

  if (error || !videoBlobUrl) {
    return (
      <div className={`flex items-center justify-center bg-muted text-muted-foreground text-sm ${className || 'w-full h-48'}`}>
        Erro ao carregar vídeo
      </div>
    );
  }

  return (
    <video 
      {...props}
      poster={posterBlobUrl || undefined}
      src={videoBlobUrl}
      className={className}
    />
  );
};
