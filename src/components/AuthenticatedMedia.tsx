import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface AuthenticatedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

export const AuthenticatedImage = ({ src, alt, ...props }: AuthenticatedImageProps) => {
  const [imageSrc, setImageSrc] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadImage = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setLoading(false);
          return;
        }

        const response = await fetch(src, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        if (response.ok) {
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          setImageSrc(objectUrl);
        }
      } catch (error) {
        console.error("Error loading image:", error);
      } finally {
        setLoading(false);
      }
    };

    loadImage();

    return () => {
      if (imageSrc) {
        URL.revokeObjectURL(imageSrc);
      }
    };
  }, [src]);

  if (loading) {
    return <div className="w-full h-full flex items-center justify-center bg-muted animate-pulse" />;
  }

  if (!imageSrc) {
    return <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground">Erro ao carregar</div>;
  }

  return <img src={imageSrc} alt={alt} {...props} />;
};

interface AuthenticatedVideoProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  src: string;
  posterSrc?: string;
}

export const AuthenticatedVideo = ({ src, posterSrc, ...props }: AuthenticatedVideoProps) => {
  const [posterBlobUrl, setPosterBlobUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [authenticatedSrc, setAuthenticatedSrc] = useState<string>("");

  useEffect(() => {
    const loadMedia = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setLoading(false);
          return;
        }

        // Set authenticated src with token
        setAuthenticatedSrc(`${src}?token=${session.access_token}`);

        // Load poster
        if (posterSrc) {
          const posterResponse = await fetch(posterSrc, {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          });

          if (posterResponse.ok) {
            const posterBlob = await posterResponse.blob();
            const posterObjectUrl = URL.createObjectURL(posterBlob);
            setPosterBlobUrl(posterObjectUrl);
          }
        }

        setLoading(false);
      } catch (error) {
        console.error("Error loading video media:", error);
        setLoading(false);
      }
    };

    loadMedia();

    return () => {
      if (posterBlobUrl) URL.revokeObjectURL(posterBlobUrl);
    };
  }, [src, posterSrc]);

  if (loading) {
    return <div className="w-full h-full flex items-center justify-center bg-muted animate-pulse" />;
  }

  return (
    <video 
      {...props}
      poster={posterBlobUrl || undefined}
    >
      {authenticatedSrc && <source src={authenticatedSrc} type="video/mp4" />}
      Seu navegador não suporta vídeos.
    </video>
  );
};
