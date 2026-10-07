import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  nomeDoMes,
  pct,
  reais,
  reaisCurto,
  type DiaSemana,
  type FatiaCanal,
  type MesSerie,
} from "@/lib/resultadosImovel";

/**
 * Gráficos da página de resultados, em SVG próprio.
 *
 * Regras seguidas em todos (skill dataviz):
 * - marcas finas (barra de até 24 px, linha de 2 px), ponta arredondada só no
 *   lado do dado, grade em fio contínuo e discreta;
 * - cor só para a série (tokens --grafico-N); texto sempre em token de texto;
 * - toda barra/ponto tem dica ao passar o mouse e ao focar pelo teclado, e os
 *   mesmos valores existem na visão em tabela.
 */

export const COR = {
  serie1: "hsl(var(--grafico-1))",
  serie1Clara: "hsl(var(--grafico-1) / 0.38)",
  serie2: "hsl(var(--grafico-2))",
  neutro: "hsl(var(--grafico-neutro))",
  grade: "hsl(var(--border))",
  superficie: "hsl(var(--card))",
};

/** Largura do contêiner, acompanhando redimensionamento. */
export function useLargura<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [largura, setLargura] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setLargura(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setLargura(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, largura];
}

/** Teto "redondo" para o eixo: 1, 2, 2,5 ou 5 × 10ⁿ. */
function tetoRedondo(maximo: number): number {
  if (maximo <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(maximo)));
  for (const m of [1, 2, 2.5, 5, 10]) if (maximo <= m * p) return m * p;
  return 10 * p;
}

/* ------------------------------------------------------------------------ */
/* Dica (tooltip) e legenda                                                  */
/* ------------------------------------------------------------------------ */

interface DicaProps {
  x: number;
  largura: number;
  titulo: string;
  children: ReactNode;
}

/** Caixa de valores presa ao topo do gráfico, acompanhando o X apontado. */
function Dica({ x, largura, titulo, children }: DicaProps) {
  const LARGURA_DICA = 188;
  const esquerda = Math.max(0, Math.min(largura - LARGURA_DICA, x - LARGURA_DICA / 2));
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-0 z-10 rounded-lg border border-border/70 bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-md"
      style={{ left: esquerda, width: LARGURA_DICA }}
    >
      <p className="mb-1 font-medium first-letter:uppercase">{titulo}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export function LinhaDica({ cor, rotulo, valor, tracejada }: { cor?: string; rotulo: string; valor: string; tracejada?: boolean }) {
  return (
    <p className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        {cor && (
          <span
            className="h-0.5 w-3 shrink-0 rounded-full"
            style={tracejada ? { backgroundImage: `linear-gradient(90deg, ${cor} 60%, transparent 0)`, backgroundSize: "5px 2px" } : { background: cor }}
            aria-hidden="true"
          />
        )}
        <span className="truncate">{rotulo}</span>
      </span>
      <span className="font-semibold tabular-nums text-foreground">{valor}</span>
    </p>
  );
}

export function Legenda({ itens, className }: { itens: { cor: string; rotulo: string; linha?: boolean }[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      {itens.map((i) => (
        <li key={i.rotulo} className="flex items-center gap-1.5">
          <span
            className={cn("shrink-0", i.linha ? "h-0.5 w-3.5 rounded-full" : "h-2.5 w-2.5 rounded-[3px]")}
            style={{ background: i.cor }}
            aria-hidden="true"
          />
          {i.rotulo}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------------ */
/* Receita por mês                                                           */
/* ------------------------------------------------------------------------ */

interface ReceitaMensalProps {
  serie: MesSerie[];
  /** Período escolhido no filtro: os meses que ele toca ganham uma faixa de fundo. */
  selecao: { inicio: number; fim: number };
  onSelecionarMes: (mes: MesSerie) => void;
}

/**
 * Colunas empilhadas por mês: diárias já realizadas (cheio) e já reservadas
 * para a frente (mesmo tom, mais claro). Clicar numa coluna filtra a página
 * por aquele mês.
 */
export function GraficoReceitaMensal({ serie, selecao, onSelecionarMes }: ReceitaMensalProps) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const [ativo, setAtivo] = useState<number | null>(null);

  const ALTURA_PLOT = 172;
  const TOPO = 22;
  const BASE = 30;
  const EIXO = largura < 420 ? 62 : 72;
  const altura = TOPO + ALTURA_PLOT + BASE;
  const plotW = Math.max(0, largura - EIXO - 4);
  const faixa = serie.length > 0 ? plotW / serie.length : 0;
  const barra = Math.min(24, Math.max(6, faixa * 0.56));

  const maximo = useMemo(() => tetoRedondo(Math.max(1, ...serie.map((m) => m.realizado + m.reservado))), [serie]);
  const y = (v: number) => TOPO + ALTURA_PLOT - (v / maximo) * ALTURA_PLOT;
  const marcas = [0, 0.5, 1].map((f) => f * maximo);
  const maior = serie.reduce((a, m) => (m.realizado + m.reservado > a.realizado + a.reservado ? m : a), serie[0]);
  const iAtual = Math.max(0, serie.findIndex((m) => m.atual));

  return (
    <div ref={ref} className="relative w-full" style={{ height: altura }}>
      {largura > 0 && serie.length > 0 && (
        <svg width={largura} height={altura} role="img" aria-label="Diárias por mês: realizado e já reservado">
          {/* grade */}
          {marcas.map((v) => (
            <g key={v}>
              <line x1={EIXO} x2={largura} y1={y(v)} y2={y(v)} stroke={COR.grade} strokeWidth={1} />
              <text x={EIXO - 8} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                {reaisCurto(v)}
              </text>
            </g>
          ))}

          {/* faixa do período escolhido: uma só, do primeiro ao último mês que ele toca */}
          {(() => {
            const dentro = serie.map((m, i) => (m.fim > selecao.inicio && m.inicio < selecao.fim ? i : -1)).filter((i) => i >= 0);
            if (dentro.length === 0) return null;
            const x0 = EIXO + faixa * dentro[0] + 1;
            const x1 = EIXO + faixa * (dentro[dentro.length - 1] + 1) - 1;
            return <rect x={x0} y={TOPO - 10} width={Math.max(0, x1 - x0)} height={ALTURA_PLOT + 10} rx={8} fill="hsl(var(--primary) / 0.07)" />;
          })()}

          {serie.map((m, i) => {
            const cx = EIXO + faixa * i + faixa / 2;
            const total = m.realizado + m.reservado;
            const hReal = (m.realizado / maximo) * ALTURA_PLOT;
            const hRes = (m.reservado / maximo) * ALTURA_PLOT;
            const vao = hReal > 0 && hRes > 0 ? 2 : 0;
            const emFoco = ativo === i;
            return (
              <g key={m.chave}>
                {emFoco && (
                  <rect
                    x={EIXO + faixa * i + 1}
                    y={TOPO - 10}
                    width={Math.max(0, faixa - 2)}
                    height={ALTURA_PLOT + 10}
                    rx={6}
                    fill="hsl(var(--foreground) / 0.05)"
                  />
                )}
                {hReal > 0 && (
                  <path
                    d={colunaArredondada(cx - barra / 2, y(m.realizado), barra, hReal, hRes > 0 ? 0 : 4)}
                    fill={COR.serie1}
                    className="origin-bottom animate-crescer-barra motion-reduce:animate-none"
                    style={{ transformBox: "fill-box", animationDelay: `${i * 30}ms` }}
                  />
                )}
                {hRes > 0 && (
                  <path
                    d={colunaArredondada(cx - barra / 2, y(total), barra, Math.max(0, hRes - vao), 4)}
                    fill={COR.serie1Clara}
                    className="origin-bottom animate-crescer-barra motion-reduce:animate-none"
                    style={{ transformBox: "fill-box", animationDelay: `${i * 30 + 80}ms` }}
                  />
                )}
                {/* rótulo direto só no maior mês */}
                {m === maior && total > 0 && (
                  <text x={cx} y={y(total) - 7} textAnchor="middle" className="fill-foreground text-[11px] font-semibold tabular-nums">
                    {reaisCurto(total)}
                  </text>
                )}
                {/* faixa estreita (celular): um rótulo sim, um não, contando a partir do mês atual */}
                {(faixa >= 28 || (i - iAtual) % 2 === 0) && (
                  <text
                    x={cx}
                    y={TOPO + ALTURA_PLOT + 17}
                    textAnchor="middle"
                    className={cn("text-[11px]", m.atual ? "fill-foreground font-semibold" : "fill-muted-foreground")}
                  >
                    {m.rotulo}
                  </text>
                )}
                {(i === 0 || m.mes0 === 0) && faixa >= 28 && (
                  <text x={cx} y={TOPO + ALTURA_PLOT + 29} textAnchor="middle" className="fill-muted-foreground/70 text-[10px] tabular-nums">
                    {m.ano}
                  </text>
                )}
                {/* alvo de toque: a faixa inteira do mês */}
                <rect
                  x={EIXO + faixa * i}
                  y={0}
                  width={faixa}
                  height={altura}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`${nomeDoMes(m.ano, m.mes0)}: ${reais(m.realizado)} realizado${m.reservado > 0 ? `, ${reais(m.reservado)} já reservado` : ""}. Filtrar por este mês.`}
                  className="cursor-pointer outline-none"
                  onPointerEnter={() => setAtivo(i)}
                  onPointerLeave={() => setAtivo((a) => (a === i ? null : a))}
                  onFocus={() => setAtivo(i)}
                  onBlur={() => setAtivo((a) => (a === i ? null : a))}
                  onClick={() => onSelecionarMes(m)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelecionarMes(m);
                    }
                  }}
                />
              </g>
            );
          })}
        </svg>
      )}

      {ativo != null && serie[ativo] && (
        <Dica x={EIXO + faixa * ativo + faixa / 2} largura={largura} titulo={nomeDoMes(serie[ativo].ano, serie[ativo].mes0)}>
          {(serie[ativo].realizado > 0 || !serie[ativo].futuro) && (
            <LinhaDica cor={COR.serie1} rotulo="Realizado" valor={reais(serie[ativo].realizado)} />
          )}
          {serie[ativo].reservado > 0 && <LinhaDica cor={COR.serie1Clara} rotulo="Já reservado" valor={reais(serie[ativo].reservado)} />}
          {serie[ativo].ocupacao != null && <LinhaDica rotulo="Ocupação" valor={pct(serie[ativo].ocupacao!)} />}
          {serie[ativo].diariaMedia > 0 && <LinhaDica rotulo="Diária média" valor={reais(serie[ativo].diariaMedia)} />}
        </Dica>
      )}
    </div>
  );
}

/** Coluna com o topo arredondado e a base reta (a base é a linha do zero). */
function colunaArredondada(x: number, yTopo: number, w: number, h: number, raio: number): string {
  const r = Math.min(raio, w / 2, h);
  return `M${x},${yTopo + h} V${yTopo + r} Q${x},${yTopo} ${x + r},${yTopo} H${x + w - r} Q${x + w},${yTopo} ${x + w},${yTopo + r} V${yTopo + h} Z`;
}

/* ------------------------------------------------------------------------ */
/* Ocupação: imóvel × média RIOS                                             */
/* ------------------------------------------------------------------------ */

/**
 * Até três linhas no mesmo eixo de 0 a 100%: o imóvel (cor), a média da
 * carteira RIOS (cinza) e o mercado em volta, pelo PriceLabs (azul). Nos meses
 * à frente a linha do imóvel fica tracejada: é o que já está reservado.
 */
export function GraficoOcupacao({ serie, selecao }: { serie: MesSerie[]; selecao: { inicio: number; fim: number } }) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const [ativo, setAtivo] = useState<number | null>(null);

  const ALTURA_PLOT = 150;
  const TOPO = 14;
  const BASE = 30;
  const EIXO = 40;
  const altura = TOPO + ALTURA_PLOT + BASE;
  const plotW = Math.max(0, largura - EIXO - 26);
  const passo = serie.length > 1 ? plotW / (serie.length - 1) : 0;
  const x = (i: number) => EIXO + 6 + passo * i;
  const y = (v: number) => TOPO + ALTURA_PLOT - v * ALTURA_PLOT;

  const trecho = (campo: "ocupacao" | "ocupacaoRios" | "ocupacaoMercado", filtro: (m: MesSerie, i: number) => boolean) => {
    let d = "";
    let aberto = false;
    serie.forEach((m, i) => {
      const v = m[campo];
      if (v == null || !filtro(m, i)) {
        aberto = false;
        return;
      }
      d += `${aberto ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      aberto = true;
    });
    return d;
  };

  const iAtual = serie.findIndex((m) => m.atual);
  const corte = iAtual < 0 ? serie.length - 1 : iAtual;
  const temRios = serie.some((m) => m.ocupacaoRios != null);
  const temMercado = serie.some((m) => m.ocupacaoMercado != null);

  // Área sob a linha do imóvel (só a parte realizada), como uma lavagem leve.
  const realizados = serie.map((m, i) => ({ m, i })).filter(({ m, i }) => i <= corte && m.ocupacao != null);
  const area =
    realizados.length > 1
      ? `M${x(realizados[0].i)},${y(0)} ` +
        realizados.map(({ m, i }) => `L${x(i).toFixed(1)},${y(m.ocupacao!).toFixed(1)}`).join(" ") +
        ` L${x(realizados[realizados.length - 1].i)},${y(0)} Z`
      : "";

  const aoMover = (e: React.PointerEvent<SVGRectElement>) => {
    const caixa = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - caixa.left;
    const i = Math.round((px - 6) / (passo || 1));
    setAtivo(Math.max(0, Math.min(serie.length - 1, i)));
  };

  return (
    <div ref={ref} className="relative w-full" style={{ height: altura }}>
      {largura > 0 && serie.length > 1 && (
        <svg width={largura} height={altura} role="img" aria-label="Ocupação por mês: imóvel e média da carteira RIOS">
          {[0, 0.5, 1].map((v) => (
            <g key={v}>
              <line x1={EIXO} x2={largura} y1={y(v)} y2={y(v)} stroke={COR.grade} strokeWidth={1} />
              <text x={EIXO - 8} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                {pct(v)}
              </text>
            </g>
          ))}

          {/* faixa do período escolhido */}
          {(() => {
            const dentro = serie.map((m, i) => (m.fim > selecao.inicio && m.inicio < selecao.fim ? i : -1)).filter((i) => i >= 0);
            if (dentro.length === 0) return null;
            const x0 = Math.max(EIXO, x(dentro[0]) - passo / 2);
            const x1 = Math.min(largura, x(dentro[dentro.length - 1]) + passo / 2);
            return <rect x={x0} y={TOPO - 6} width={x1 - x0} height={ALTURA_PLOT + 6} rx={6} fill="hsl(var(--primary) / 0.07)" />;
          })()}

          {temRios && (
            <path d={trecho("ocupacaoRios", () => true)} fill="none" stroke={COR.neutro} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          )}
          {temMercado && (
            <path d={trecho("ocupacaoMercado", () => true)} fill="none" stroke={COR.serie2} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          )}

          {area && <path d={area} fill="hsl(var(--grafico-1) / 0.1)" />}
          <path d={trecho("ocupacao", (_m, i) => i <= corte)} fill="none" stroke={COR.serie1} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <path
            d={trecho("ocupacao", (_m, i) => i >= corte)}
            fill="none"
            stroke={COR.serie1}
            strokeWidth={2}
            strokeDasharray="2 5"
            strokeLinecap="round"
          />

          {serie.map((m, i) => (
            <g key={m.chave}>
              <text
                x={x(i)}
                y={TOPO + ALTURA_PLOT + 17}
                textAnchor="middle"
                className={cn("text-[11px]", m.atual ? "fill-foreground font-semibold" : "fill-muted-foreground")}
              >
                {passo < 28 && (i - corte) % 2 !== 0 ? "" : m.rotulo}
              </text>
              {m.ocupacao != null && (i === corte || ativo === i) && (
                <circle cx={x(i)} cy={y(m.ocupacao)} r={4.5} fill={COR.serie1} stroke={COR.superficie} strokeWidth={2} />
              )}
              {m.ocupacaoRios != null && ativo === i && (
                <circle cx={x(i)} cy={y(m.ocupacaoRios)} r={4.5} fill={COR.neutro} stroke={COR.superficie} strokeWidth={2} />
              )}
              {m.ocupacaoMercado != null && ativo === i && (
                <circle cx={x(i)} cy={y(m.ocupacaoMercado)} r={4.5} fill={COR.serie2} stroke={COR.superficie} strokeWidth={2} />
              )}
            </g>
          ))}

          {ativo != null && <line x1={x(ativo)} x2={x(ativo)} y1={TOPO - 6} y2={TOPO + ALTURA_PLOT} stroke="hsl(var(--foreground) / 0.25)" strokeWidth={1} />}

          <rect
            x={EIXO}
            y={0}
            width={Math.max(0, largura - EIXO)}
            height={altura}
            fill="transparent"
            onPointerMove={aoMover}
            onPointerDown={aoMover}
            onPointerLeave={() => setAtivo(null)}
          />
        </svg>
      )}

      {ativo != null && serie[ativo] && (
        <Dica x={x(ativo)} largura={largura} titulo={nomeDoMes(serie[ativo].ano, serie[ativo].mes0)}>
          <LinhaDica
            cor={COR.serie1}
            tracejada={ativo > corte}
            rotulo={ativo > corte ? "Imóvel (já reservado)" : "Imóvel"}
            valor={serie[ativo].ocupacao != null ? pct(serie[ativo].ocupacao!) : "—"}
          />
          {temRios && (
            <LinhaDica cor={COR.neutro} rotulo="Média RIOS" valor={serie[ativo].ocupacaoRios != null ? pct(serie[ativo].ocupacaoRios!) : "—"} />
          )}
          {temMercado && (
            <LinhaDica cor={COR.serie2} rotulo="Mercado" valor={serie[ativo].ocupacaoMercado != null ? pct(serie[ativo].ocupacaoMercado!) : "—"} />
          )}
          <LinhaDica rotulo="Noites reservadas" valor={`${serie[ativo].noites} de ${serie[ativo].disponiveis}`} />
        </Dica>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Dias da semana                                                            */
/* ------------------------------------------------------------------------ */

/** Sete colunas (seg a dom). Sexta e sábado em destaque; o resto em cinza. */
export function GraficoDiasDaSemana({ dias }: { dias: DiaSemana[] }) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const [ativo, setAtivo] = useState<number | null>(null);

  const ALTURA_PLOT = 120;
  const TOPO = 20;
  const BASE = 24;
  const altura = TOPO + ALTURA_PLOT + BASE;
  const faixa = dias.length > 0 ? largura / dias.length : 0;
  const barra = Math.min(24, Math.max(8, faixa * 0.5));
  const y = (v: number) => TOPO + ALTURA_PLOT - v * ALTURA_PLOT;
  const melhor = dias.reduce((a, d) => (d.ocupacao > a.ocupacao ? d : a), dias[0]);

  return (
    <div ref={ref} className="relative w-full" style={{ height: altura }}>
      {largura > 0 && (
        <svg width={largura} height={altura} role="img" aria-label="Ocupação por dia da semana">
          {[0, 0.5, 1].map((v) => (
            <line key={v} x1={0} x2={largura} y1={y(v)} y2={y(v)} stroke={COR.grade} strokeWidth={1} />
          ))}
          {dias.map((d, i) => {
            const cx = faixa * i + faixa / 2;
            const h = d.ocupacao * ALTURA_PLOT;
            return (
              <g key={d.rotulo}>
                {ativo === i && <rect x={faixa * i + 1} y={TOPO - 8} width={Math.max(0, faixa - 2)} height={ALTURA_PLOT + 8} rx={6} fill="hsl(var(--foreground) / 0.05)" />}
                {h > 0 && (
                  <path
                    d={colunaArredondada(cx - barra / 2, y(d.ocupacao), barra, h, 4)}
                    fill={d.fimDeSemana ? COR.serie1 : COR.neutro}
                    className="origin-bottom animate-crescer-barra motion-reduce:animate-none"
                    style={{ transformBox: "fill-box", animationDelay: `${i * 40}ms` }}
                  />
                )}
                {d === melhor && d.ocupacao > 0 && (
                  <text x={cx} y={y(d.ocupacao) - 6} textAnchor="middle" className="fill-foreground text-[11px] font-semibold tabular-nums">
                    {pct(d.ocupacao)}
                  </text>
                )}
                <text x={cx} y={TOPO + ALTURA_PLOT + 16} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                  {d.rotulo}
                </text>
                <rect
                  x={faixa * i}
                  y={0}
                  width={faixa}
                  height={altura}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${d.rotulo}: ${pct(d.ocupacao)} de ocupação, ${d.noites} de ${d.dias} noites`}
                  className="outline-none"
                  onPointerEnter={() => setAtivo(i)}
                  onPointerLeave={() => setAtivo((a) => (a === i ? null : a))}
                  onFocus={() => setAtivo(i)}
                  onBlur={() => setAtivo((a) => (a === i ? null : a))}
                />
              </g>
            );
          })}
        </svg>
      )}
      {ativo != null && dias[ativo] && (
        <Dica x={faixa * ativo + faixa / 2} largura={largura} titulo={`Noites de ${dias[ativo].rotulo.toLowerCase()}`}>
          <LinhaDica rotulo="Ocupação" valor={pct(dias[ativo].ocupacao)} />
          <LinhaDica rotulo="Noites reservadas" valor={`${dias[ativo].noites} de ${dias[ativo].dias}`} />
          {dias[ativo].diariaMedia > 0 && <LinhaDica rotulo="Diária média" valor={reais(dias[ativo].diariaMedia)} />}
        </Dica>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Canais: parte do todo                                                     */
/* ------------------------------------------------------------------------ */

/** Barra única dividida por canal + a lista com os valores (a "tabela" do gráfico). */
export function BarraDeCanais({ fatias }: { fatias: FatiaCanal[] }) {
  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Divisão das diárias por canal">
        {fatias.map((f) => (
          <div
            key={f.id}
            className="h-full min-w-[4px] transition-[flex-grow] duration-500"
            style={{ flexGrow: Math.max(f.parte, 0.01), flexBasis: 0, background: f.cor }}
            title={`${f.rotulo}: ${pct(f.parte)}`}
          />
        ))}
      </div>
      <ul className="space-y-2">
        {fatias.map((f) => (
          <li key={f.id} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: f.cor }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{f.rotulo}</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {f.reservas} {f.reservas === 1 ? "reserva" : "reservas"}
            </span>
            <span className="w-11 text-right text-xs tabular-nums text-muted-foreground">{pct(f.parte)}</span>
            <span className="w-24 text-right font-medium tabular-nums">{reais(f.receita)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Barras horizontais (uma série)                                            */
/* ------------------------------------------------------------------------ */

/** Lista de barras horizontais de uma série só: rótulo, barra e valor à vista. */
export function BarrasHorizontais({
  itens,
  cor = COR.serie2,
  rotuloValor,
}: {
  itens: { rotulo: string; parte: number; valor: number }[];
  cor?: string;
  rotuloValor: (item: { parte: number; valor: number }) => string;
}) {
  const maximo = Math.max(0.0001, ...itens.map((i) => i.parte));
  return (
    <ul className="space-y-2.5">
      {itens.map((i) => (
        <li key={i.rotulo} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-2.5 text-xs">
          <span className="truncate text-muted-foreground">{i.rotulo}</span>
          <span className="h-2 overflow-hidden rounded-r-full" aria-hidden="true">
            <span
              className="block h-full rounded-r-full transition-[width] duration-500"
              style={{ width: `${Math.max(i.parte > 0 ? 3 : 0, (i.parte / maximo) * 100)}%`, background: cor }}
            />
          </span>
          <span className="w-16 text-right font-medium tabular-nums">{rotuloValor(i)}</span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------------ */
/* Medidor e minigráfico                                                     */
/* ------------------------------------------------------------------------ */

/** Barra de progresso de uma razão: trilho no mesmo tom, mais claro. */
export function Medidor({ fracao, rotulo, detalhe }: { fracao: number; rotulo: string; detalhe: string }) {
  const f = Math.max(0, Math.min(1, fracao));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">{rotulo}</span>
        <span className="text-sm font-semibold tabular-nums">{pct(f)}</span>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full"
        style={{ background: "hsl(var(--grafico-1) / 0.16)" }}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(f * 100)}
        aria-label={rotulo}
      >
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${f * 100}%`, background: COR.serie1 }} />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{detalhe}</p>
    </div>
  );
}

/** Linha miúda de tendência para os cartões de número: cinza, com o último ponto em destaque. */
export function Minigrafico({ valores, className }: { valores: number[]; className?: string }) {
  if (valores.length < 2) return null;
  const W = 96;
  const H = 28;
  const max = Math.max(...valores);
  const min = Math.min(...valores);
  const amp = max - min || 1;
  const px = (i: number) => 3 + (i / (valores.length - 1)) * (W - 6);
  const py = (v: number) => H - 4 - ((v - min) / amp) * (H - 8);
  const d = valores.map((v, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  const ultimo = valores.length - 1;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden="true">
      <path d={d} fill="none" stroke={COR.neutro} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={px(ultimo)} cy={py(valores[ultimo])} r={3} fill={COR.serie1} stroke={COR.superficie} strokeWidth={1.5} />
    </svg>
  );
}
