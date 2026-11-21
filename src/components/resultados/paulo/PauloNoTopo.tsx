import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { irAteOAlvo, type FalaDoPaulo } from "@/lib/falasDoPaulo";
import { PauloDeFilme, type ControlePaulo } from "./PauloDeFilme";

/**
 * Onde o Paulo fica na faixa do topo: de meio corpo, à direita. Em tela larga
 * a caixa dele encosta na base da faixa e passa um pouco do topo (a cabeça sai
 * da moldura). No celular ele fica em cima, na frente da foto, e a base da
 * caixa se desfaz para o corte na cintura não aparecer. Nos dois, a borda
 * esquerda também se desfaz: alguns clipes cortam a mão ali.
 */
const CAIXA = cn(
  "absolute right-0 -top-3 aspect-[4/5] h-[252px]",
  "[mask-image:linear-gradient(to_right,transparent,black_10%),linear-gradient(to_bottom,black_78%,transparent)] [-webkit-mask-composite:source-in] [mask-composite:intersect]",
  "lg:bottom-0 lg:right-[8%] lg:top-auto lg:h-[107%] lg:[mask-image:linear-gradient(to_right,transparent,black_10%)]",
);

interface Props {
  falas: FalaDoPaulo[];
}

/**
 * O Mini Paulo apresentando os resultados: aparece, dá oi e conta os
 * destaques num balão. Tocar nele (ou em "Próximo") passa para o destaque
 * seguinte, com um gesto, e o botão do balão leva ao cartão de onde saiu o
 * número. Fica por cima da faixa do topo; o pai precisa ser `relative`.
 */
export function PauloNoTopo({ falas }: Props) {
  const reduzido = useReducedMotion();
  const controle = useRef<ControlePaulo | null>(null);
  const [chegou, setChegou] = useState(false);
  const [indice, setIndice] = useState(0);
  const [mexeu, setMexeu] = useState(false);

  const total = falas.length;
  const fala = falas[Math.min(indice, total - 1)];

  const irPara = useCallback(
    (i: number) => {
      const proxima = falas[i];
      if (!proxima) return;
      setIndice(i);
      controle.current?.gesto(proxima.gesto ?? "fala");
    },
    [falas],
  );

  const seguinte = useCallback(() => {
    setMexeu(true);
    if (total < 2) {
      controle.current?.gesto("greet");
      return;
    }
    // depois da última volta para a segunda (o "oi" não se repete), e ele comemora a volta completa
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
    const espera = window.setTimeout(() => irPara(1), 5200);
    return () => window.clearTimeout(espera);
  }, [chegou, mexeu, indice, total, irPara]);

  if (!fala) return null;

  return (
    // o recorte deixa o Paulo passar do topo da faixa, mas não dos lados nem da base (com os cantos de baixo arredondados)
    <div className="pointer-events-none absolute inset-0 z-10 [clip-path:inset(-56px_0_0_0_round_0_0_1rem_1rem)]">
      <div className={CAIXA}>
        <PauloDeFilme controle={controle} parado={!!reduzido} aoChegar={() => setChegou(true)} className="absolute inset-0" />
        {chegou && (
          <button
            type="button"
            onClick={seguinte}
            aria-label="Paulo: ouvir o próximo destaque"
            className="pointer-events-auto absolute inset-y-0 left-[30%] right-[4%] rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-foreground/70"
          />
        )}
      </div>

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
            className="pointer-events-auto absolute left-3 top-3 w-[min(58%,236px)] rounded-2xl bg-secondary-foreground px-3.5 py-3 text-secondary shadow-xl ring-1 ring-secondary/10 lg:left-auto lg:right-[32%] lg:top-[10%] lg:w-[264px]"
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
