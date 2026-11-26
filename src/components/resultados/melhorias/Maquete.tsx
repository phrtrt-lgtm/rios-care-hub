import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MelhoriaId } from "@/lib/melhorias";
import { criarCenaMaquete, type CenaMaquete, type ManifestoMaquete } from "./maqueteCena";

export interface PontoDaMaquete {
  id: MelhoriaId;
  rotulo: string;
  estado: "tem" | "simulando" | "falta";
}

interface MaqueteProps {
  /** O manifesto do modelo (`/melhorias/<modelo>/maquete.json`). Trocar de modelo pede `key` nova. */
  manifesto: ManifestoMaquete;
  /** Camadas à vista: o que o imóvel já tem e o que está na simulação. */
  ativos: MelhoriaId[];
  /** A camada que acabou de entrar ou sair: a troca nasce nela. */
  revelar: MelhoriaId | null;
  /** Cômodo enquadrado (`null` = o apartamento todo). */
  foco: string | null;
  pontos: PontoDaMaquete[];
  escolhido: MelhoriaId | null;
  aoEscolher: (id: MelhoriaId) => void;
  /** Altura (px) da faixa que cobre a base do palco: a maquete é enquadrada acima dela. */
  margemBase?: number;
  className?: string;
  children?: ReactNode;
}

/** A cor do canto da pintura (o fundo dela), lida da própria imagem. */
function corDoCanto(img: HTMLImageElement): string | undefined {
  try {
    const folha = document.createElement("canvas");
    folha.width = folha.height = 1;
    const ctx = folha.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(img, 4, 4, 1, 1, 0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgb(${r}, ${g}, ${b})`;
  } catch {
    return undefined;
  }
}

function semMovimento(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A maquete do plano de melhorias: a pintura que gira, com um marcador em cada melhoria.
 * Sem WebGL (ou se a placa de vídeo cair), mostra a mesma pintura parada, em imagens empilhadas.
 */
export function Maquete({ manifesto: MANIFESTO, ativos, revelar, foco, pontos, escolhido, aoEscolher, margemBase = 0, className, children }: MaqueteProps) {
  const tela = useRef<HTMLCanvasElement>(null);
  const cena = useRef<CenaMaquete | null>(null);
  const marcadores = useRef(new Map<MelhoriaId, HTMLButtonElement>());
  const [modo, setModo] = useState<"espera" | "vivo" | "parado">("espera");
  // sem WebGL a pintura não cobre o palco inteiro: o que sobra recebe a cor do fundo da própria pintura
  const [fundo, setFundo] = useState<string | undefined>(undefined);
  const PASTA = `/melhorias/${MANIFESTO.modelo}`;
  const camadas = useMemo(() => new Map(MANIFESTO.camadas.map((c) => [c.id as MelhoriaId, c])), [MANIFESTO]);

  // estado mais recente, para o desenho de cada quadro ler sem recriar a cena
  const atual = useRef({ ativos, revelar, foco, margemBase });
  atual.current = { ativos, revelar, foco, margemBase };

  useEffect(() => {
    const canvas = tela.current;
    if (!canvas) return;
    const c = criarCenaMaquete(canvas, MANIFESTO, PASTA, { parado: semMovimento(), aoFalhar: () => setModo("parado") });
    if (!c) {
      setModo("parado");
      return;
    }
    cena.current = c;
    c.aoChegar = () => setModo("vivo");
    c.aoDesenhar = () => {
      const caixa = canvas.getBoundingClientRect();
      for (const [id, el] of marcadores.current) {
        const camada = camadas.get(id);
        if (!camada) continue;
        const ponto = camada.marca;
        // item à vista: o marcador sobe para cima dele; item que falta: fica onde ele vai entrar
        const noTopo = el.dataset.estado !== "falta";
        const p = c.projetar(ponto.x, noTopo ? ponto.topo : ponto.y, ponto.prof[0], ponto.prof[1]);
        const fora = p.x < 14 || p.y < 14 || p.x > caixa.width - 14 || p.y > caixa.height - 14;
        el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%)`;
        el.style.opacity = fora ? "0" : "1";
        el.style.pointerEvents = fora ? "none" : "auto";
      }
    };
    c.margem(atual.current.margemBase);
    c.definir(atual.current.ativos, null);
    c.focar(atual.current.foco);
    return () => {
      cena.current = null;
      c.destruir();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camadas]);

  const chave = ativos.join(",");
  useEffect(() => {
    cena.current?.definir(atual.current.ativos, atual.current.revelar);
  }, [chave]);
  useEffect(() => {
    cena.current?.focar(foco);
  }, [foco]);
  useEffect(() => {
    cena.current?.margem(margemBase);
  }, [margemBase]);

  return (
    <div className={cn("relative isolate overflow-hidden bg-secondary", className)} style={fundo ? { backgroundColor: fundo } : undefined}>
      {modo !== "parado" && (
        <canvas
          ref={tela}
          role="img"
          aria-label="Maquete de um apartamento com as melhorias do plano. Arraste para girar."
          className={cn("absolute inset-0 h-full w-full cursor-grab touch-pan-y transition-opacity duration-500 active:cursor-grabbing", modo === "vivo" ? "opacity-100" : "opacity-0")}
        />
      )}

      {modo === "parado" && (
        // sem WebGL: a mesma pintura, parada, com as camadas por cima
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative w-full" style={{ aspectRatio: `${MANIFESTO.largura} / ${MANIFESTO.altura}` }}>
            <img
              src={`${PASTA}/base.webp`}
              alt="Maquete de um apartamento com as melhorias do plano"
              className="absolute inset-0 h-full w-full"
              onLoad={(e) => setFundo(corDoCanto(e.currentTarget))}
            />
            {MANIFESTO.camadas.map((c) => (
              <img
                key={c.id}
                src={`${PASTA}/camada-${c.id}.webp`}
                alt=""
                aria-hidden="true"
                className={cn("absolute transition-opacity duration-500", ativos.includes(c.id as MelhoriaId) ? "opacity-100" : "opacity-0")}
                style={{
                  left: `${(c.x / MANIFESTO.largura) * 100}%`,
                  top: `${(c.y / MANIFESTO.altura) * 100}%`,
                  width: `${(c.l / MANIFESTO.largura) * 100}%`,
                  height: `${(c.a / MANIFESTO.altura) * 100}%`,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* marcadores: um por melhoria, presos ao lugar do item na pintura */}
      {modo === "vivo" &&
        pontos.map((p) => (
          <button
            key={p.id}
            type="button"
            ref={(el) => {
              if (el) marcadores.current.set(p.id, el);
              else marcadores.current.delete(p.id);
            }}
            onClick={() => aoEscolher(p.id)}
            aria-label={`${p.rotulo}: ${p.estado === "tem" ? "o imóvel já tem" : p.estado === "simulando" ? "na simulação" : "tocar para ver"}`}
            aria-pressed={escolhido === p.id}
            data-estado={p.estado}
            className={cn(
              "group absolute left-0 top-0 z-10 flex items-center justify-center rounded-full opacity-0 shadow-md outline-none transition-[opacity,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              p.estado === "tem" && "h-5 w-5 bg-success text-success-foreground",
              p.estado === "simulando" && "h-6 w-6 bg-primary text-primary-foreground",
              p.estado === "falta" && "h-6 w-6 bg-secondary-foreground text-secondary sm:h-7 sm:w-7",
              escolhido === p.id && "ring-2 ring-primary ring-offset-2 ring-offset-secondary",
            )}
          >
            {p.estado === "falta" && (
              <span aria-hidden="true" className="absolute inset-0 rounded-full bg-secondary-foreground/70 motion-safe:animate-ping [animation-duration:2.4s]" />
            )}
            {p.estado === "falta" ? <Plus className="relative h-4 w-4" aria-hidden="true" /> : <Check className={cn("relative", p.estado === "tem" ? "h-3 w-3" : "h-3.5 w-3.5")} aria-hidden="true" />}
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-secondary-foreground/95 px-2 py-0.5 text-[11px] font-medium text-secondary shadow-sm transition-opacity",
                p.estado === "falta" ? "top-full mt-1.5" : "bottom-full mb-1.5",
                escolhido === p.id ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
              )}
            >
              {p.rotulo}
            </span>
          </button>
        ))}

      {children}
    </div>
  );
}
