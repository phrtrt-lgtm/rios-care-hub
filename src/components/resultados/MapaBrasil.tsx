import { cn } from "@/lib/utils";
import type { OrigemUf } from "@/lib/resultadosImovel";

/**
 * Mapa do Brasil em blocos: um quadrado por estado, na posição aproximada do
 * mapa. Serve para mostrar de onde vêm os hóspedes sem depender de contorno
 * geográfico (27 caminhos pesados) e continua legível em 150 px de largura.
 *
 * A intensidade da cor acompanha o número de reservas; os valores exatos ficam
 * na lista ao lado e na dica de cada bloco.
 */

/** [coluna, linha] de cada estado numa grade de 6 × 9. */
const POSICAO: Record<string, [number, number]> = {
  RR: [2, 0], AP: [3, 0],
  AM: [1, 1], PA: [2, 1], MA: [3, 1], CE: [4, 1], RN: [5, 1],
  AC: [0, 2], RO: [1, 2], TO: [2, 2], PI: [3, 2], PE: [4, 2], PB: [5, 2],
  MT: [1, 3], GO: [2, 3], BA: [3, 3], SE: [4, 3], AL: [5, 3],
  MS: [1, 4], DF: [2, 4], MG: [3, 4], ES: [4, 4],
  SP: [2, 5], RJ: [3, 5],
  PR: [2, 6],
  SC: [2, 7],
  RS: [2, 8],
};

const LADO = 36;
const VAO = 4;
const LARGURA = 6 * (LADO + VAO) - VAO;
const ALTURA = 9 * (LADO + VAO) - VAO;

interface Props {
  ufs: OrigemUf[];
  /** "escuro": sobre o azul da marca (história do mês). "claro": dentro de um cartão. */
  variante?: "claro" | "escuro";
  /** Os estados com reserva entram um a um */
  animar?: boolean;
  className?: string;
}

export function MapaBrasil({ ufs, variante = "claro", animar = false, className }: Props) {
  const porUf = new Map(ufs.map((u) => [u.uf, u]));
  const maximo = Math.max(1, ...ufs.map((u) => u.reservas));
  const ordem = new Map(ufs.map((u, i) => [u.uf, i]));
  const escuro = variante === "escuro";

  const resumo =
    ufs.length > 0
      ? ufs
          .slice(0, 5)
          .map((u) => `${u.nome} ${u.reservas}`)
          .join(", ")
      : "sem origem informada";

  return (
    <svg
      viewBox={`0 0 ${LARGURA} ${ALTURA}`}
      role="img"
      aria-label={`Mapa do Brasil com a origem dos hóspedes: ${resumo}`}
      className={cn("h-auto w-full", className)}
    >
      {Object.entries(POSICAO).map(([uf, [col, lin]]) => {
        const dado = porUf.get(uf);
        const x = col * (LADO + VAO);
        const y = lin * (LADO + VAO);
        const forca = dado ? 0.42 + 0.58 * (dado.reservas / maximo) : 0;
        return (
          <g
            key={uf}
            className={cn(dado && animar && "animate-pop-in motion-reduce:animate-none")}
            style={
              dado && animar
                ? { transformBox: "fill-box", transformOrigin: "center", animationDelay: `${300 + (ordem.get(uf) ?? 0) * 120}ms`, animationFillMode: "both" }
                : undefined
            }
          >
            <rect
              x={x}
              y={y}
              width={LADO}
              height={LADO}
              rx={7}
              fill={
                dado
                  ? `hsl(var(--grafico-1) / ${forca.toFixed(2)})`
                  : escuro
                    ? "hsl(var(--secondary-foreground) / 0.1)"
                    : "hsl(var(--muted))"
              }
            />
            {/* só os estados com reserva levam a sigla: o mapa é pequeno, e sigla em todo bloco vira ruído */}
            {dado && (
              <text
                x={x + LADO / 2}
                y={y + LADO / 2 + 5.5}
                textAnchor="middle"
                className="text-[15px] font-bold"
                // bloco claro (poucas reservas) sobre cartão claro pede letra escura
                fill={escuro || forca >= 0.75 ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))"}
              >
                {uf}
              </text>
            )}
            <title>{dado ? `${dado.nome}: ${dado.reservas} ${dado.reservas === 1 ? "reserva" : "reservas"}` : uf}</title>
          </g>
        );
      })}
    </svg>
  );
}
