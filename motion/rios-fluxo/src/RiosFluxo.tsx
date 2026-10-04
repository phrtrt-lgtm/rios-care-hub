import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

// Paleta RIOS: azul profundo (fundo), azul claro e terracota (correntes).
const AZUL_FUNDO_A = "#0c1c2a";
const AZUL_FUNDO_B = "#17334d";
const AZUL_CLARO = "#6fb1dc";
const TERRA = "#d9743c";
const TERRA_CLARA = "#f0a374";

const TAU = Math.PI * 2;

interface Corrente {
  base: number; // 0..1 da altura
  amp1: number;
  amp2: number;
  k1: number; // ondas ao longo da largura
  k2: number;
  fase: number;
  ciclos1: number; // voltas inteiras por loop => emenda perfeita
  ciclos2: number;
  largura: number;
  opacidade: number;
  cor: "azul" | "terra";
  pulso: number; // voltas inteiras do brilho por loop (0 = sem brilho)
}

const CORRENTES: Corrente[] = [
  { base: 0.30, amp1: 34, amp2: 12, k1: 1.1, k2: 2.7, fase: 0.3, ciclos1: 1, ciclos2: -1, largura: 1.2, opacidade: 0.22, cor: "azul", pulso: 0 },
  { base: 0.40, amp1: 42, amp2: 16, k1: 0.9, k2: 2.2, fase: 1.4, ciclos1: 1, ciclos2: 2, largura: 2.2, opacidade: 0.5, cor: "azul", pulso: 1 },
  { base: 0.47, amp1: 30, amp2: 20, k1: 1.3, k2: 3.1, fase: 2.2, ciclos1: -1, ciclos2: 1, largura: 1.2, opacidade: 0.28, cor: "azul", pulso: 0 },
  { base: 0.56, amp1: 46, amp2: 14, k1: 0.8, k2: 2.4, fase: 3.6, ciclos1: 1, ciclos2: -2, largura: 2.8, opacidade: 0.75, cor: "terra", pulso: 1 },
  { base: 0.63, amp1: 36, amp2: 18, k1: 1.2, k2: 2.9, fase: 4.4, ciclos1: 1, ciclos2: 1, largura: 1.4, opacidade: 0.4, cor: "terra", pulso: 0 },
  { base: 0.71, amp1: 40, amp2: 12, k1: 1.0, k2: 2.0, fase: 5.1, ciclos1: -1, ciclos2: 2, largura: 2.0, opacidade: 0.42, cor: "azul", pulso: 2 },
  { base: 0.80, amp1: 28, amp2: 16, k1: 1.4, k2: 3.3, fase: 0.9, ciclos1: 1, ciclos2: -1, largura: 1.2, opacidade: 0.25, cor: "terra", pulso: 0 },
  { base: 0.88, amp1: 32, amp2: 10, k1: 0.9, k2: 2.6, fase: 2.9, ciclos1: 1, ciclos2: 1, largura: 1.6, opacidade: 0.3, cor: "azul", pulso: 0 },
];

function caminho(c: Corrente, t: number, w: number, h: number): string {
  const pontos: string[] = [];
  const passos = 96;
  for (let i = 0; i <= passos; i++) {
    const u = i / passos;
    const x = -20 + u * (w + 40);
    // As correntes abrem para a direita: à esquerda ficam calmas (onde entra o texto).
    const abertura = 0.35 + 0.65 * u;
    const y =
      c.base * h +
      abertura *
        (c.amp1 * Math.sin(c.k1 * TAU * u + c.fase + TAU * c.ciclos1 * t) +
          c.amp2 * Math.sin(c.k2 * TAU * u + c.fase * 1.7 + TAU * c.ciclos2 * t));
    pontos.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pontos.join(" ");
}

export const RiosFluxo: React.FC = () => {
  const quadro = useCurrentFrame();
  const { durationInFrames, width: w, height: h } = useVideoConfig();
  const t = quadro / durationInFrames; // 0..1, emenda no fim

  // Brilhos de fundo, em órbitas fechadas.
  const bx1 = 0.78 + 0.05 * Math.cos(TAU * t);
  const by1 = 0.3 + 0.1 * Math.sin(TAU * t);
  const bx2 = 0.74 + 0.06 * Math.cos(TAU * t + 2.1);
  const by2 = 0.85 + 0.08 * Math.sin(TAU * t + 2.1);

  const TRACO = 2600; // maior que o comprimento de qualquer corrente

  return (
    <AbsoluteFill style={{ background: `linear-gradient(115deg, ${AZUL_FUNDO_A} 0%, ${AZUL_FUNDO_B} 62%, #1d3d5a 100%)` }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <defs>
          <radialGradient id="brilhoTerra" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={TERRA} stopOpacity={0.26} />
            <stop offset="100%" stopColor={TERRA} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="brilhoAzul" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={AZUL_CLARO} stopOpacity={0.26} />
            <stop offset="100%" stopColor={AZUL_CLARO} stopOpacity={0} />
          </radialGradient>
          <linearGradient id="tracoAzul" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={AZUL_CLARO} stopOpacity={0} />
            <stop offset="35%" stopColor={AZUL_CLARO} stopOpacity={0.7} />
            <stop offset="100%" stopColor="#a9d4f0" stopOpacity={1} />
          </linearGradient>
          <linearGradient id="tracoTerra" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={TERRA} stopOpacity={0} />
            <stop offset="35%" stopColor={TERRA} stopOpacity={0.8} />
            <stop offset="100%" stopColor={TERRA_CLARA} stopOpacity={1} />
          </linearGradient>
          <filter id="suave" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        <ellipse cx={bx1 * w} cy={by1 * h} rx={w * 0.3} ry={h * 0.62} fill="url(#brilhoAzul)" />
        <ellipse cx={bx2 * w} cy={by2 * h} rx={w * 0.28} ry={h * 0.6} fill="url(#brilhoTerra)" />

        {CORRENTES.map((c, i) => {
          const d = caminho(c, t, w, h);
          const traco = c.cor === "azul" ? "url(#tracoAzul)" : "url(#tracoTerra)";
          return (
            <g key={i}>
              <path d={d} fill="none" stroke={traco} strokeWidth={c.largura} strokeLinecap="round" opacity={c.opacidade} />
              {c.pulso > 0 && (
                <>
                  {/* Brilho que corre pela corrente: o deslocamento dá voltas inteiras no loop. */}
                  <path
                    d={d}
                    fill="none"
                    stroke={c.cor === "azul" ? "#cfe8f8" : TERRA_CLARA}
                    strokeWidth={c.largura + 5}
                    strokeLinecap="round"
                    strokeDasharray={`90 ${TRACO - 90}`}
                    strokeDashoffset={-TRACO * c.pulso * t - i * 340}
                    opacity={0.5}
                    filter="url(#suave)"
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke={c.cor === "azul" ? "#e6f3fb" : "#ffd9c2"}
                    strokeWidth={c.largura + 0.6}
                    strokeLinecap="round"
                    strokeDasharray={`60 ${TRACO - 60}`}
                    strokeDashoffset={-TRACO * c.pulso * t - i * 340 - 15}
                    opacity={0.95}
                  />
                </>
              )}
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};
