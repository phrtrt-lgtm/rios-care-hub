import { useEffect, useState } from "react";
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
  mimeType?: string;
}

export const AuthenticatedVideo = ({ src, mimeType = "video/mp4", ...props }: AuthenticatedVideoProps) => {
  return (
    <video {...props}>
      <source src={src} type={mimeType} />
      Seu navegador não suporta vídeos.
    </video>
  );
};
