import { useEffect, useRef, type MutableRefObject } from "react";
import type { GestoPaulo } from "@/lib/falasDoPaulo";
import { criarCenaPaulo, type CenaPaulo } from "./pauloCena";

/** O que a página pode pedir ao Paulo em 3D. */
export interface ControlePaulo {
  gesto(nome: GestoPaulo): void;
  /** Ponteiro em pixels dentro da caixa; null quando sai. */
  olhar(x: number | null, y?: number): void;
  relance(lado: number): void;
}

interface Props {
  /** Onde ele pára, de 0 (esquerda da caixa) a 1 (direita). */
  lugar: number;
  /** Chega andando pela direita. */
  entrada: boolean;
  /** "Reduzir movimento": pose parada. */
  semMovimento?: boolean;
  controle: MutableRefObject<ControlePaulo | null>;
  aoChegar: () => void;
  aoFalhar: () => void;
  className?: string;
}

/**
 * Caixa do Mini Paulo em 3D. A caixa é maior que ele (sobra em cima, para os
 * braços erguidos) e não recebe toque: quem escuta o clique é o botão que a
 * página põe por cima.
 *
 * Traz o three.js e o modelo: carregue sempre por `lazyPage`.
 */
export default function PauloFigura3D({ lugar, entrada, semMovimento, controle, aoChegar, aoFalhar, className }: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const cena = useRef<CenaPaulo | null>(null);
  // a cena nasce uma vez: os avisos vão por referência, para a página poder trocar de função sem recriar o Paulo
  const avisos = useRef({ aoChegar, aoFalhar });
  avisos.current = { aoChegar, aoFalhar };
  const inicial = useRef({ lugar, entrada, semMovimento });

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const nova = criarCenaPaulo(el, {
      lugar: inicial.current.lugar,
      entrada: inicial.current.entrada,
      semMovimento: inicial.current.semMovimento,
      aoChegar: () => avisos.current.aoChegar(),
      aoFalhar: () => avisos.current.aoFalhar(),
    });
    if (!nova) {
      avisos.current.aoFalhar();
      return;
    }
    cena.current = nova;
    controle.current = nova;
    if (import.meta.env.DEV) (window as unknown as { __paulo?: CenaPaulo }).__paulo = nova;
    return () => {
      nova.destruir();
      cena.current = null;
      controle.current = null;
    };
  }, [controle]);

  useEffect(() => {
    cena.current?.definirLugar(lugar);
  }, [lugar]);

  return <div ref={caixa} aria-hidden="true" className={className} />;
}
