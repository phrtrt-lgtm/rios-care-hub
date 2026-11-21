import { Component, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { lazyPage } from "@/lib/lazyPage";
import { irAteOAlvo, type FalaDoPaulo } from "@/lib/falasDoPaulo";
import type { ControlePaulo } from "../cena3d/PauloFigura3D";

// O three.js e o modelo só baixam aqui, e só em aparelho que desenha WebGL (quem decide é a página).
const PauloFigura3D = lazyPage(() => import("../cena3d/PauloFigura3D"));

const TELA_LARGA = "(min-width: 1024px)";

/**
 * Onde o Paulo fica na faixa do topo. No celular ele fica em cima, à direita,
 * na frente da foto; em tela larga, de corpo inteiro, com o pé na base da
 * faixa. A caixa 3D passa do topo da faixa de propósito: quando ele ergue os
 * braços, as mãos saem da moldura.
 */
const CAIXA_3D = "absolute inset-x-0 -top-9 h-[286px] lg:top-[-18%] lg:h-[118%]";
const LUGAR = { celular: 0.8, largo: 0.72 };

/**
 * O Paulo é enfeite: se a cena 3D quebrar (modelo corrompido, aparelho que
 * perde o WebGL no meio), a página de resultados tem de continuar de pé.
 */
class SeQuebrar extends Component<{ aoQuebrar: () => void; children: ReactNode }, { quebrou: boolean }> {
  state = { quebrou: false };

  static getDerivedStateFromError() {
    return { quebrou: true };
  }

  componentDidCatch() {
    this.props.aoQuebrar();
  }

  render() {
    return this.state.quebrou ? null : this.props.children;
  }
}

interface Props {
  falas: FalaDoPaulo[];
  /** O modelo não carregou ou o aparelho não desenhou: a página volta ao topo sem o Paulo. */
  aoFalhar: () => void;
}

/**
 * O Mini Paulo em 3D apresentando os resultados: chega, acena e conta os
 * destaques num balão. Tocar nele (ou em "Próximo") passa para o destaque
 * seguinte, com um gesto, e o botão do balão leva ao cartão de onde saiu o
 * número. Fica por cima da faixa do topo; o pai precisa ser `relative`.
 */
export function PauloNoTopo({ falas, aoFalhar }: Props) {
  const reduzido = useReducedMotion();
  const raiz = useRef<HTMLDivElement>(null);
  const controle = useRef<ControlePaulo | null>(null);
  const [largo, setLargo] = useState(() => window.matchMedia(TELA_LARGA).matches);
  const [chegou, setChegou] = useState(false);
  const [indice, setIndice] = useState(0);
  const [mexeu, setMexeu] = useState(false);

  useEffect(() => {
    const midia = window.matchMedia(TELA_LARGA);
    const aoMudar = () => setLargo(midia.matches);
    midia.addEventListener("change", aoMudar);
    return () => midia.removeEventListener("change", aoMudar);
  }, []);

  const total = falas.length;
  const fala = falas[Math.min(indice, total - 1)];

  const irPara = useCallback(
    (i: number) => {
      const proxima = falas[i];
      if (!proxima) return;
      setIndice(i);
      if (proxima.gesto) controle.current?.gesto(proxima.gesto);
      else controle.current?.relance(-1);
    },
    [falas],
  );

  const seguinte = useCallback(() => {
    setMexeu(true);
    if (total < 2) {
      controle.current?.gesto("greet");
      return;
    }
    // depois da última volta para a segunda (o "oi" não se repete), e ele comemora a volta completa dançando
    if (indice + 1 >= total) {
      setIndice(1);
      controle.current?.gesto("dance");
    } else {
      irPara(indice + 1);
    }
  }, [indice, irPara, total]);

  // Depois do "oi", a segunda fala entra sozinha uma vez; dali em diante é a pessoa que pede.
  useEffect(() => {
    if (!chegou || mexeu || indice !== 0 || total < 2) return;
    const espera = window.setTimeout(() => irPara(1), 4200);
    return () => window.clearTimeout(espera);
  }, [chegou, mexeu, indice, total, irPara]);

  // A cabeça acompanha o mouse enquanto ele passeia pela faixa.
  useEffect(() => {
    const faixa = raiz.current?.parentElement;
    if (!faixa || reduzido) return;
    const mover = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const caixa = raiz.current?.firstElementChild;
      if (!caixa) return;
      const r = caixa.getBoundingClientRect();
      controle.current?.olhar(e.clientX - r.left, e.clientY - r.top);
    };
    const sair = () => controle.current?.olhar(null);
    faixa.addEventListener("pointermove", mover);
    faixa.addEventListener("pointerleave", sair);
    return () => {
      faixa.removeEventListener("pointermove", mover);
      faixa.removeEventListener("pointerleave", sair);
    };
  }, [reduzido]);

  if (!fala) return null;

  return (
    <div ref={raiz} className="pointer-events-none absolute inset-0 z-10">
      <SeQuebrar aoQuebrar={aoFalhar}>
        <Suspense fallback={null}>
          <PauloFigura3D
            className={CAIXA_3D}
            lugar={largo ? LUGAR.largo : LUGAR.celular}
            entrada={!reduzido}
            semMovimento={!!reduzido}
            controle={controle}
            aoChegar={() => setChegou(true)}
            aoFalhar={aoFalhar}
          />
        </Suspense>
      </SeQuebrar>

      {chegou && (
        <button
          type="button"
          onClick={seguinte}
          aria-label="Paulo: ouvir o próximo destaque"
          className="pointer-events-auto absolute right-[3%] top-3 h-[236px] w-[34%] rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-foreground/70 lg:left-[65%] lg:right-auto lg:top-0 lg:h-full lg:w-[14%]"
        />
      )}

      <AnimatePresence>
        {chegou && (
          <motion.div
            key="balao"
            role="status"
            initial={reduzido ? false : { opacity: 0, scale: 0.7, x: 16 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 26 }}
            style={{ transformOrigin: "100% 30%" }}
            // claro sobre o azul da faixa e sobre a foto, nos dois temas
            className="pointer-events-auto absolute left-3 top-3 w-[min(60%,236px)] rounded-2xl bg-secondary-foreground px-3.5 py-3 text-secondary shadow-xl ring-1 ring-secondary/10 lg:left-auto lg:right-[34%] lg:top-[10%] lg:w-[264px]"
          >
            <span className="absolute -right-1.5 top-6 h-3.5 w-3.5 rotate-45 rounded-[3px] bg-secondary-foreground" aria-hidden="true" />
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={fala.id}
                initial={reduzido ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduzido ? undefined : { opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
                className="relative text-[13px] font-medium leading-snug lg:text-sm"
              >
                {fala.texto}
              </motion.p>
            </AnimatePresence>

            <div className="relative mt-2.5 flex items-center gap-2">
              {fala.acao && (
                <button
                  type="button"
                  onClick={() => {
                    setMexeu(true);
                    if (fala.acao?.aoClicar) fala.acao.aoClicar();
                    else if (fala.acao?.alvo) irAteOAlvo(fala.acao.alvo);
                  }}
                  className="whitespace-nowrap rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground transition-transform hover:scale-[1.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-1 active:scale-[0.97] motion-reduce:transition-none"
                >
                  {fala.acao.rotulo}
                </button>
              )}
              {total > 1 && (
                <button
                  type="button"
                  onClick={seguinte}
                  className="ml-auto inline-flex items-center gap-0.5 rounded-full py-1 pl-2 pr-1 text-[11px] font-semibold text-secondary/75 transition-colors hover:bg-secondary/10 hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40"
                >
                  <span className="sr-only">Próximo destaque. </span>
                  <span aria-hidden="true" className="flex items-center gap-[3px] pr-0.5">
                    {falas.map((f, i) => (
                      <span key={f.id} className={cn("h-1 rounded-full transition-all", i === indice ? "w-2.5 bg-secondary" : "w-1 bg-secondary/30")} />
                    ))}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
