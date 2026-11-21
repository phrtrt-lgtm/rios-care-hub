import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { GestoPaulo } from "@/lib/falasDoPaulo";
import { cn } from "@/lib/utils";
import { criarTocadorComAlfa, type TocadorComAlfa } from "./videoComAlfa";

/** O que a página pode pedir ao Paulo. "fala" é falar sem um gesto marcado. */
export interface ControlePaulo {
  gesto(nome: GestoPaulo | "fala"): void;
}

/**
 * Clipes do Mini Paulo dos vídeos (o mesmo da propaganda do portal), de meio
 * corpo e já com a boca mexendo. Saem de `motion/paulo-filme/preparar.py`.
 */
const CLIPE = {
  ola: "/paulo/ola.mp4",
  apresenta: "/paulo/apresenta.mp4",
  joia: "/paulo/joia.mp4",
  encantado: "/paulo/encantado.mp4",
  descanso: "/paulo/descanso.mp4",
} as const;
type NomeDoClipe = keyof typeof CLIPE;

/** Quadro parado do descanso: "reduzir movimento", aparelho sem WebGL e enquanto o vídeo não chega. */
const PARADO = "/paulo/descanso.webp";

/** Os dois closes entram um pouco menores, para a cabeça não saltar de tamanho na troca. */
const ESCALA: Partial<Record<NomeDoClipe, number>> = { joia: 0.86, encantado: 0.86 };

const DO_GESTO: Record<GestoPaulo, NomeDoClipe> = {
  greet: "ola",
  point: "apresenta",
  look: "apresenta",
  cheer: "joia",
  dance: "encantado",
};

interface Props {
  controle: MutableRefObject<ControlePaulo | null>;
  /** "Reduzir movimento": fica só o quadro parado. */
  parado: boolean;
  /** Ele apareceu e começou a falar: hora de abrir o balão. */
  aoChegar: () => void;
  className?: string;
}

/**
 * O Mini Paulo animado (meio corpo, fundo transparente). Entra subindo, dá
 * oi, e fica de braços cruzados até a página pedir uma fala; cada fala toca um
 * clipe e ele volta ao descanso. A caixa tem a proporção dos clipes (4:5) e
 * ele fica apoiado na base dela.
 */
export function PauloDeFilme({ controle, parado, aoChegar, className }: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const avisos = useRef({ aoChegar });
  avisos.current = { aoChegar };
  // "espera": nada na tela; "parado": o quadro parado; "vivo": o vídeo
  const [estado, setEstado] = useState<"espera" | "parado" | "vivo">(parado ? "parado" : "espera");

  useEffect(() => {
    if (parado) {
      avisos.current.aoChegar();
      return;
    }
    const el = caixa.current;
    const canvas = tela.current;
    if (!el || !canvas) return;

    let chegou = false;
    const chegar = () => {
      if (chegou) return;
      chegou = true;
      el.animate(
        [
          { transform: "translateY(14%)", opacity: 0 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 520, easing: "cubic-bezier(0.2, 1, 0.3, 1)" },
      );
      avisos.current.aoChegar();
    };
    // a troca de clipe é um corte seco; o pulinho disfarça e dá vida
    const pular = () => el.animate([{ transform: "scale(0.965)" }, { transform: "none" }], { duration: 260, easing: "cubic-bezier(0.2, 1.5, 0.4, 1)" });

    const tocador: TocadorComAlfa | null = criarTocadorComAlfa(canvas);
    if (!tocador) {
      setEstado("parado");
      chegar();
      return;
    }

    let alternado = false;
    const descansar = () => tocador.tocar(CLIPE.descanso, { laco: true });
    const tocar = (nome: NomeDoClipe, aoComecar?: () => void) =>
      tocador.tocar(CLIPE[nome], { escala: ESCALA[nome], aoComecar, aoTerminar: descansar });

    tocar("ola", () => {
      setEstado("vivo");
      chegar();
    });
    tocador.preparar(CLIPE.descanso);
    // os outros clipes baixam depois, sem disputar a rede com a página
    const baixarResto = window.setTimeout(() => {
      tocador.preparar(CLIPE.apresenta);
      tocador.preparar(CLIPE.joia);
      tocador.preparar(CLIPE.encantado);
    }, 2500);
    // rede lenta ou vídeo barrado pelo aparelho: ele aparece parado e o balão abre do mesmo jeito
    const semVideo = window.setTimeout(() => {
      if (chegou) return;
      setEstado("parado");
      chegar();
    }, 3500);

    controle.current = {
      gesto(nome) {
        let clipe: NomeDoClipe;
        if (nome === "fala") {
          // fala sem gesto marcado: alterna os dois clipes em que ele conversa
          alternado = !alternado;
          clipe = alternado ? "apresenta" : "ola";
        } else {
          clipe = DO_GESTO[nome];
        }
        tocar(clipe, () => {
          setEstado("vivo");
          pular();
        });
      },
    };

    // só toca à vista e com a aba aberta
    let naTela = true;
    const atualizar = () => (naTela && !document.hidden ? tocador.retomar() : tocador.pausar());
    const observador = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver((e) => ((naTela = e.some((x) => x.isIntersecting)), atualizar())) : null;
    observador?.observe(el);
    document.addEventListener("visibilitychange", atualizar);

    return () => {
      window.clearTimeout(baixarResto);
      window.clearTimeout(semVideo);
      observador?.disconnect();
      document.removeEventListener("visibilitychange", atualizar);
      controle.current = null;
      tocador.destruir();
    };
  }, [parado, controle]);

  return (
    <div ref={caixa} aria-hidden="true" className={cn("origin-bottom", estado === "espera" && "opacity-0", className)}>
      {estado !== "vivo" && <img src={PARADO} alt="" className="absolute inset-0 h-full w-full" />}
      {!parado && <canvas ref={tela} className={cn("absolute inset-0 h-full w-full", estado !== "vivo" && "opacity-0")} />}
    </div>
  );
}
