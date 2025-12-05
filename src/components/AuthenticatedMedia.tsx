import React, { useEffect, useState, useRef } from "react";
import { useMediaCache, generateVideoThumbnail } from "@/hooks/useMediaCache";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageOff, VideoOff, Play } from "lucide-react";

interface AuthenticatedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  showVideoThumbnail?: boolean;
}

export const AuthenticatedImage = ({ src, alt, className, showVideoThumbnail, ...props }: AuthenticatedImageProps) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { loadMedia, getCachedUrl } = useMediaCache();
  const mountedRef = useRef(true);
  const loadAttemptRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadAttemptRef.current += 1;
    const currentAttempt = loadAttemptRef.current;

    const load = async () => {
      if (!src) {
        setLoading(false);
        setError(true);
        return;
      }

      setLoading(true);
      setError(false);

      // Check cache first
      const cached = getCachedUrl(src);
      if (cached) {
        if (!cancelled && mountedRef.current && currentAttempt === loadAttemptRef.current) {
          setImageSrc(cached);
          setLoading(false);
        }
        return;
      }

      const blobUrl = await loadMedia(src);
      if (!cancelled && mountedRef.current && currentAttempt === loadAttemptRef.current) {
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
      <div className={`flex items-center justify-center bg-muted text-muted-foreground ${className || 'w-full h-full'}`}>
        <ImageOff className="w-6 h-6 opacity-50" />
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
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(false);

      // Check video cache first
      const cachedVideo = getCachedUrl(src);
      if (cachedVideo) {
        if (!cancelled && mountedRef.current) {
          setVideoBlobUrl(cachedVideo);
        }
      } else {
        const videoUrl = await loadMedia(src);
        if (!cancelled && mountedRef.current) {
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
          if (!cancelled && mountedRef.current) {
            setPosterBlobUrl(cachedPoster);
          }
        } else {
          const posterUrl = await loadMedia(posterSrc);
          if (!cancelled && mountedRef.current && posterUrl) {
            setPosterBlobUrl(posterUrl);
          }
        }
      }

      if (!cancelled && mountedRef.current) {
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
      <div className={`flex items-center justify-center bg-muted text-muted-foreground ${className || 'w-full h-48'}`}>
        <VideoOff className="w-8 h-8 opacity-50" />
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

// Component for showing video thumbnail in lists
interface VideoThumbnailProps {
  src: string;
  posterSrc?: string;
  className?: string;
  onClick?: () => void;
}

export const VideoThumbnail = ({ src, posterSrc, className, onClick }: VideoThumbnailProps) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { loadMedia, getCachedUrl } = useMediaCache();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);

      // First try poster if available
      if (posterSrc) {
        const cachedPoster = getCachedUrl(posterSrc);
        if (cachedPoster) {
          if (!cancelled && mountedRef.current) {
            setThumbnailUrl(cachedPoster);
            setLoading(false);
          }
          return;
        }
        
        const posterUrl = await loadMedia(posterSrc);
        if (!cancelled && mountedRef.current && posterUrl) {
          setThumbnailUrl(posterUrl);
          setLoading(false);
          return;
        }
      }

      // Generate thumbnail from video
      const cachedVideo = getCachedUrl(src);
      if (cachedVideo) {
        const thumb = await generateVideoThumbnail(cachedVideo);
        if (!cancelled && mountedRef.current) {
          setThumbnailUrl(thumb);
          setLoading(false);
        }
        return;
      }

      const videoUrl = await loadMedia(src);
      if (!cancelled && mountedRef.current && videoUrl) {
        const thumb = await generateVideoThumbnail(videoUrl);
        if (!cancelled && mountedRef.current) {
          setThumbnailUrl(thumb);
          setLoading(false);
        }
      } else {
        if (!cancelled && mountedRef.current) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [src, posterSrc, loadMedia, getCachedUrl]);

  if (loading) {
    return <Skeleton className={className || "w-full h-full"} />;
  }

  return (
    <div 
      className={`relative cursor-pointer group ${className || 'w-full h-full'}`}
      onClick={onClick}
    >
      {thumbnailUrl ? (
        <img 
          src={thumbnailUrl} 
          alt="Video thumbnail" 
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full bg-muted flex items-center justify-center">
          <VideoOff className="w-8 h-8 text-muted-foreground opacity-50" />
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
        <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center">
          <Play className="w-5 h-5 text-primary ml-0.5" fill="currentColor" />
        </div>
      </div>
    </div>
  );
};
