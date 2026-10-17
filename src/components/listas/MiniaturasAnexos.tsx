import { ImageIcon, Play } from "lucide-react";
import { ehVideoCaminho } from "@/lib/anexosListas";

interface Props {
  caminhos: string[];
  /** URLs assinadas na mesma ordem (null quando a assinatura falhou). */
  urls: (string | null)[];
  onAbrir: (indice: number) => void;
}

/** Fotos e vídeos de um item da lista; o clique abre a galeria. */
export function MiniaturasAnexos({ caminhos, urls, onAbrir }: Props) {
  if (caminhos.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {caminhos.map((caminho, i) => {
        const url = urls[i];
        const video = ehVideoCaminho(caminho);
        if (!url) {
          return (
            <span
              key={caminho}
              title="Arquivo indisponível"
              className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-border bg-muted/50 text-muted-foreground"
            >
              <ImageIcon className="h-4 w-4" aria-hidden="true" />
            </span>
          );
        }
        return (
          <button
            key={caminho}
            type="button"
            onClick={() => onAbrir(i)}
            aria-label={`Ver ${video ? "vídeo" : "foto"} ${i + 1}`}
            className="relative h-14 w-14 overflow-hidden rounded-lg border border-border/70 bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {video ? (
              <>
                <video src={`${url}#t=0.5`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground/60 text-background">
                    <Play className="h-3 w-3 fill-current" />
                  </span>
                </span>
              </>
            ) : (
              <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
            )}
          </button>
        );
      })}
    </div>
  );
}
