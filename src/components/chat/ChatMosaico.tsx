import { useState } from "react";
import { ImageOff, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { detectMediaKind } from "@/lib/mediaType";
import type { AnexoChat } from "./anexos";

interface ChatMosaicoProps {
  midias: AnexoChat[];
  aoAbrir: (anexo: AnexoChat, indice: number) => void;
  /** Mensagem ainda não confirmada pelo servidor. */
  pending?: boolean;
  className?: string;
}

/** Até quatro células; da quinta em diante a última mostra "+N". */
const MAXIMO_VISIVEL = 4;

/** Grade por quantidade: 1 inteira, 2 lado a lado, 3 com a primeira alta, 4 em 2×2. */
function layout(n: number): { caixa: string; celulas: string[] } {
  if (n === 1) return { caixa: "grid-cols-1", celulas: [""] };
  if (n === 2) return { caixa: "grid-cols-2 aspect-[2/1]", celulas: ["", ""] };
  if (n === 3) return { caixa: "grid-cols-2 grid-rows-2 aspect-[4/3]", celulas: ["row-span-2", "", ""] };
  return { caixa: "grid-cols-2 grid-rows-2 aspect-[4/3]", celulas: ["", "", "", ""] };
}

/**
 * Fotos e vídeos de uma mensagem em mosaico, grandes e lado a lado, como nos
 * aplicativos de mensagem. Cada célula abre a galeria no item certo.
 */
export function ChatMosaico({ midias, aoAbrir, pending, className }: ChatMosaicoProps) {
  if (midias.length === 0) return null;
  const visiveis = midias.slice(0, MAXIMO_VISIVEL);
  const escondidas = midias.length - visiveis.length;
  const { caixa, celulas } = layout(visiveis.length);

  return (
    <div
      role="group"
      aria-label={`${midias.length} ${midias.length === 1 ? "anexo" : "anexos"}`}
      className={cn(
        "grid w-[min(100%,420px)] gap-1 overflow-hidden rounded-2xl shadow-sm ring-1 ring-border/60",
        caixa,
        pending && "opacity-70",
        className,
      )}
    >
      {visiveis.map((m, i) => (
        <Celula
          key={m.id}
          anexo={m}
          className={celulas[i]}
          unica={visiveis.length === 1}
          posicao={i + 1}
          total={midias.length}
          extra={i === visiveis.length - 1 ? escondidas : 0}
          onClick={() => aoAbrir(m, i)}
        />
      ))}
    </div>
  );
}

interface CelulaProps {
  anexo: AnexoChat;
  className?: string;
  unica: boolean;
  posicao: number;
  total: number;
  /** Quantas mídias ficaram escondidas atrás desta célula. */
  extra: number;
  onClick: () => void;
}

function Celula({ anexo, className, unica, posicao, total, extra, onClick }: CelulaProps) {
  const tipo = detectMediaKind(anexo.file_type, anexo.file_name, anexo.file_url);
  const ehVideo = tipo === "video";
  const [estado, setEstado] = useState<"carregando" | "pronta" | "erro">("carregando");
  const rotulo = `${ehVideo ? "Vídeo" : "Imagem"} ${posicao} de ${total}`;

  // Sobreposições em preto e branco de propósito: ficam sobre a foto, não
  // sobre o tema, e precisam ler bem no claro e no escuro.
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={extra > 0 ? `${rotulo}, e mais ${extra}` : rotulo}
      className={cn(
        "group relative block overflow-hidden bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        unica ? "min-h-[160px] w-full" : "h-full w-full",
        className,
      )}
    >
      {estado === "carregando" && <span className="absolute inset-0 animate-pulse bg-muted-foreground/10" />}

      {ehVideo ? (
        <video
          src={anexo.file_url}
          preload="metadata"
          muted
          playsInline
          onLoadedMetadata={() => setEstado("pronta")}
          onLoadedData={() => setEstado("pronta")}
          onError={() => setEstado("erro")}
          className={cn(
            "h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]",
            unica && "max-h-[420px]",
            estado !== "pronta" && "opacity-0",
          )}
        />
      ) : (
        <img
          src={anexo.file_url}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setEstado("pronta")}
          onError={() => setEstado("erro")}
          className={cn(
            unica ? "h-auto max-h-[420px] w-full object-cover" : "h-full w-full object-cover",
            "transition duration-300 group-hover:scale-[1.03]",
            estado !== "pronta" && "opacity-0",
          )}
        />
      )}

      {estado === "erro" && (
        <span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <ImageOff className="h-6 w-6" aria-hidden="true" />
        </span>
      )}

      {ehVideo && estado !== "erro" && extra === 0 && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white shadow-md backdrop-blur-sm transition group-hover:scale-105">
            <Play className="ml-0.5 h-5 w-5" fill="currentColor" aria-hidden="true" />
          </span>
        </span>
      )}

      {extra > 0 && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 text-2xl font-semibold text-white">
          +{extra}
        </span>
      )}

      <span className="pointer-events-none absolute inset-0 bg-black/0 transition group-hover:bg-black/10" />
    </button>
  );
}
