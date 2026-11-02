// Vídeo "O portal do proprietário" na landing de captação (desde 2026-11-02, pedido do gestor).
// Desktop: 16:9 acima do formulário, fechando a coluna da direita na altura do painel da marca. Com `youtubeId`,
// é o YouTube (poster próprio; o iframe só entra no clique, para a página não carregar o player antes da hora);
// sem ID, o mp4 do bucket `videos` no player próprio, e o bloco some se o arquivo ainda não existir lá.
// Celular: chamada compacta (e link no painel) que abre a versão 9:16 em tela cheia, no player minimalista:
// toque para tocar/pausar, barra fina de progresso, som e tempo. Sem controles do navegador.
import { useCallback, useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Maximize2, Minimize2, Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { trackMetaEvent } from "@/components/MetaPixel";
import { cn } from "@/lib/utils";
import { VIDEO_PORTAL } from "./conteudo";

const formatar = (s: number) => {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
};

/** Um evento por visita, no primeiro play (ou no clique que abre o YouTube). */
let avisouPixel = false;
function avisarPixel() {
  if (avisouPixel) return;
  avisouPixel = true;
  trackMetaEvent("ViewContent", { content_name: "video-portal-proprietario", content_type: "video" });
}

const BOTAO =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-secondary-foreground/90 transition hover:bg-background/15 hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** No iPhone e no iPad o volume é do aparelho (a API é só leitura): a barra não faria nada, então não aparece. */
const SEM_VOLUME =
  typeof navigator !== "undefined" &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

const BARRA_VOLUME =
  "h-1 w-16 cursor-pointer appearance-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary";

/* ------------------------------------------------------------------------ */
/* Player minimalista                                                        */
/* ------------------------------------------------------------------------ */

interface PlayerProps {
  src: string;
  poster: string;
  /** Toca ao montar. Só funciona logo depois de um toque (o navegador exige); se recusar, fica o botão. */
  autoPlay?: boolean;
  /** Em pé, em tela cheia: o vídeo cabe inteiro e não há botão de tela cheia. */
  telaCheia?: boolean;
  className?: string;
}

export function PlayerMinimalista({ src, poster, autoPlay, telaCheia, className }: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const esconderRef = useRef<number | undefined>(undefined);
  const [tocando, setTocando] = useState(false);
  const [comecou, setComecou] = useState(false);
  const [mudo, setMudo] = useState(false);
  const [volume, setVolume] = useState(1);
  const [tempo, setTempo] = useState(0);
  const [duracao, setDuracao] = useState(0);
  const [controles, setControles] = useState(true);
  const [cheio, setCheio] = useState(false);

  // Os controles somem 2,6 s depois do último toque ou movimento, enquanto toca.
  const mostrarControles = useCallback(() => {
    setControles(true);
    window.clearTimeout(esconderRef.current);
    esconderRef.current = window.setTimeout(() => setControles(false), 2600);
  }, []);
  useEffect(() => () => window.clearTimeout(esconderRef.current), []);

  const tocar = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      await v.play();
    } catch {
      /* sem gesto recente o navegador recusa: fica o poster com o botão */
    }
  }, []);
  const alternar = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void tocar();
    else v.pause();
    mostrarControles();
  }, [tocar, mostrarControles]);

  useEffect(() => {
    if (autoPlay) void tocar();
  }, [autoPlay, tocar]);

  useEffect(() => {
    const ler = () => setCheio(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", ler);
    return () => document.removeEventListener("fullscreenchange", ler);
  }, []);

  const aoTeclar = (e: React.KeyboardEvent) => {
    const v = videoRef.current;
    if (!v || (e.target as HTMLElement).tagName === "INPUT") return; // as setas na barra de volume são dela
    const k = e.key.toLowerCase();
    if (k === " " || k === "k") {
      e.preventDefault();
      alternar();
    } else if (k === "m") {
      v.muted = !v.muted;
      setMudo(v.muted);
    } else if (k === "arrowright") {
      v.currentTime = Math.min(v.duration || 0, v.currentTime + 5);
    } else if (k === "arrowleft") {
      v.currentTime = Math.max(0, v.currentTime - 5);
    }
  };

  const buscar = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v || !duracao) return;
    const r = e.currentTarget.getBoundingClientRect();
    v.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duracao;
    mostrarControles();
  };

  const alternarSom = (e: React.MouseEvent) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted && v.volume === 0) v.volume = 0.5; // ligar o som com a barra no zero
    setMudo(v.muted);
    mostrarControles();
  };

  const mudarVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const x = Number(e.target.value);
    v.volume = x;
    v.muted = x === 0;
    mostrarControles();
  };

  const alternarTelaCheia = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = caixaRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch {
      /* navegador sem tela cheia: segue normal */
    }
  };

  const progresso = duracao ? tempo / duracao : 0;
  const visiveis = controles || !tocando;
  const total = duracao || VIDEO_PORTAL.duracaoSegundos;
  const nivel = Math.round((mudo ? 0 : volume) * 100);

  return (
    <div
      ref={caixaRef}
      role="region"
      aria-label={VIDEO_PORTAL.titulo}
      tabIndex={0}
      onKeyDown={aoTeclar}
      onPointerMove={mostrarControles}
      onClick={alternar}
      className={cn(
        "group relative isolate h-full w-full select-none overflow-hidden bg-secondary outline-none focus-visible:ring-2 focus-visible:ring-ring",
        visiveis ? "cursor-pointer" : "cursor-none",
        className,
      )}
    >
      {/* Narração em pt-BR com a legenda queimada no vídeo: não há faixa de legenda à parte. */}
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        playsInline
        preload="metadata"
        onPlay={() => {
          setTocando(true);
          setComecou(true);
          mostrarControles();
          avisarPixel();
        }}
        onPause={() => setTocando(false)}
        onEnded={() => setTocando(false)}
        onTimeUpdate={(e) => setTempo(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuracao(e.currentTarget.duration)}
        onVolumeChange={(e) => {
          setMudo(e.currentTarget.muted);
          setVolume(e.currentTarget.volume);
        }}
        className={cn("h-full w-full", telaCheia || cheio ? "object-contain" : "object-cover")}
      />

      {!tocando && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span
            className={cn(
              "flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl ring-4 ring-background/20 transition-transform group-hover:scale-105",
              telaCheia ? "h-20 w-20" : "h-16 w-16",
            )}
          >
            <Play className={cn("ml-1", telaCheia ? "h-8 w-8" : "h-7 w-7")} aria-hidden="true" />
          </span>
          <span className="sr-only">{comecou ? "Continuar" : "Assistir"}</span>
        </div>
      )}

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 bg-gradient-to-t from-secondary/85 to-transparent pt-12 transition-opacity duration-300",
          visiveis ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        style={telaCheia ? { paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" } : { paddingBottom: "0.25rem" }}
      >
        <div className="flex items-center gap-2 px-3 text-secondary-foreground">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              alternar();
            }}
            aria-label={tocando ? "Pausar" : "Tocar"}
            className={BOTAO}
          >
            {tocando ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="ml-0.5 h-4 w-4" aria-hidden="true" />}
          </button>
          <span className="text-xs tabular-nums text-secondary-foreground/90">
            {formatar(tempo)} <span className="text-secondary-foreground/50">/ {formatar(total)}</span>
          </span>
          <span className="flex-1" />
          {/* Som: botão de mudo e a barra de volume (o clique aqui não pausa o vídeo) */}
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={alternarSom} aria-label={mudo ? "Ligar o som" : "Sem som"} aria-pressed={mudo} className={BOTAO}>
              {mudo ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
            </button>
            {!SEM_VOLUME && (
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={mudo ? 0 : volume}
                onChange={mudarVolume}
                aria-label="Volume"
                className={BARRA_VOLUME}
                style={{ background: `linear-gradient(to right, hsl(var(--primary)) ${nivel}%, hsl(var(--secondary-foreground) / 0.3) ${nivel}%)` }}
              />
            )}
          </div>
          {!telaCheia && typeof document !== "undefined" && document.fullscreenEnabled && (
            <button type="button" onClick={alternarTelaCheia} aria-label={cheio ? "Sair da tela cheia" : "Tela cheia"} className={BOTAO}>
              {cheio ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
            </button>
          )}
        </div>
        <div
          role="slider"
          aria-label="Posição no vídeo"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progresso * 100)}
          onClick={buscar}
          className="mx-3 mt-1 cursor-pointer py-1.5"
        >
          <div className="h-1 w-full overflow-hidden rounded-full bg-secondary-foreground/30">
            <div className="h-full rounded-full bg-primary" style={{ width: `${progresso * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Desktop: 16:9 acima do formulário                                         */
/* ------------------------------------------------------------------------ */

type Fonte = "youtube" | "mp4" | "lendo" | "nada";

/**
 * Cabe na coluna e nunca passa de 31,5 % da altura da janela (56dvh de largura em 16:9), para o cartão do
 * formulário continuar à vista em tela baixa (1366×768). Sem YouTube nem mp4 no bucket, não desenha nada.
 */
export function VideoPortal({ className, aoAbrir }: { className?: string; aoAbrir?: () => void }) {
  const [fonte, setFonte] = useState<Fonte>(VIDEO_PORTAL.youtubeId ? "youtube" : "lendo");
  const [aberto, setAberto] = useState(false);
  const mp4 = supabase.storage.from("videos").getPublicUrl(VIDEO_PORTAL.mp4DesktopNoBucket).data.publicUrl;

  useEffect(() => {
    if (fonte !== "lendo") return;
    let vivo = true;
    fetch(mp4, { method: "HEAD" })
      .then((r) => vivo && setFonte(r.ok ? "mp4" : "nada"))
      .catch(() => vivo && setFonte("nada"));
    return () => {
      vivo = false;
    };
  }, [fonte, mp4]);

  // Enquanto confere o bucket não desenha nada: em produção hoje o arquivo ainda não existe, e um bloco que
  // aparece e some é pior que um que entra 200 ms depois.
  if (fonte === "nada" || fonte === "lendo") return null;

  const abrir = () => {
    setAberto(true);
    aoAbrir?.();
    if (fonte === "youtube") avisarPixel();
  };

  return (
    <div
      className={cn(
        "relative isolate mx-auto aspect-video w-[min(100%,56dvh)] shrink-0 overflow-hidden rounded-3xl bg-secondary shadow-xl ring-1 ring-border/60",
        className,
      )}
    >
      {aberto && fonte === "youtube" ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${VIDEO_PORTAL.youtubeId}?autoplay=1&rel=0&playsinline=1&color=white&hl=pt-BR`}
          title={VIDEO_PORTAL.titulo}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      ) : aberto && fonte === "mp4" ? (
        <PlayerMinimalista src={mp4} poster={VIDEO_PORTAL.poster.desktop} autoPlay />
      ) : (
        <button
          type="button"
          onClick={abrir}
          aria-label={`Assistir: ${VIDEO_PORTAL.titulo} (${VIDEO_PORTAL.duracao})`}
          className="group absolute inset-0 h-full w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img
            src={VIDEO_PORTAL.poster.desktop}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-secondary/80 via-transparent to-transparent" aria-hidden="true" />
          <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl ring-4 ring-background/20 transition-transform group-hover:scale-105">
              <Play className="ml-1 h-7 w-7" />
            </span>
          </span>
          <span className="absolute inset-x-0 bottom-0 p-4 text-secondary-foreground" aria-hidden="true">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-secondary-foreground/70">
              Em {VIDEO_PORTAL.duracao}
            </span>
            <span className="block text-base font-semibold leading-tight">{VIDEO_PORTAL.chamada}</span>
          </span>
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Celular: chamada compacta e vídeo 9:16 em tela cheia                      */
/* ------------------------------------------------------------------------ */

export function ChamadaVideoPortal({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-background p-2 pr-3 text-left shadow-md transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <span className="relative h-16 w-12 shrink-0 overflow-hidden rounded-xl bg-secondary">
        <img src={VIDEO_PORTAL.poster.celular} alt="" className="h-full w-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
            <Play className="ml-0.5 h-3.5 w-3.5" />
          </span>
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-tight">{VIDEO_PORTAL.chamada}</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
          {VIDEO_PORTAL.duracao} · {VIDEO_PORTAL.descricao}
        </span>
      </span>
    </button>
  );
}

export function VideoPortalTelaCheia({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  return (
    <DialogPrimitive.Root open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-secondary data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          <DialogPrimitive.Title className="sr-only">{VIDEO_PORTAL.titulo}</DialogPrimitive.Title>
          <div className="relative min-h-0 flex-1">
            {aberto && (
              <PlayerMinimalista src={VIDEO_PORTAL.mp4Celular} poster={VIDEO_PORTAL.poster.celular} autoPlay telaCheia className="h-full" />
            )}
            <DialogPrimitive.Close
              aria-label="Fechar o vídeo"
              className="absolute right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-background/15 text-secondary-foreground ring-1 ring-secondary-foreground/20 backdrop-blur-sm transition hover:bg-background/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
