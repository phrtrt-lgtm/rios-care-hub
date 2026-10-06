import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Legenda } from "./graficos";
import { Cartao, DetalheReserva } from "./blocos";
import {
  CANAIS,
  CANAL_DESCONHECIDO,
  canalDe,
  deDia,
  diaDaSemana,
  diaDe,
  formatarDia,
  infoCanal,
  metricas,
  nomeDoMes,
  paraDia,
  pct,
  reais,
  type DiaAnunciado,
  type ReservaCalculada,
} from "@/lib/resultadosImovel";

interface Props {
  reservas: ReservaCalculada[];
  anunciado: DiaAnunciado[];
  hoje: number;
  primeira: number | null;
  comissaoPct: number | null;
  visaoEquipe: boolean;
}

const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Contorno da reserva selecionada: só em cima e embaixo. Um anel completo em
// cada meia-célula desenhava uma divisória a cada dia, e a faixa parecia fatiada.
const CONTORNO = "inset 0 2px 0 hsl(var(--foreground) / 0.6), inset 0 -2px 0 hsl(var(--foreground) / 0.6)";

/**
 * Calendário do imóvel, mês a mês.
 *
 * Cada dia tem duas metades: a manhã pertence a quem dormiu a noite anterior
 * (até o check-out) e a tarde a quem dorme a noite que começa — por isso dia de
 * troca mostra as duas reservas lado a lado. Noite livre de hoje em diante
 * mostra o preço anunciado. Tocar numa reserva abre os detalhes.
 */
export function CalendarioReservas({ reservas, anunciado, hoje, primeira, comissaoPct, visaoEquipe }: Props) {
  const base = deDia(hoje);
  const [mes, setMes] = useState({ ano: base.getFullYear(), mes0: base.getMonth() });
  const [selecionada, setSelecionada] = useState<string | null>(null);

  const inicio = diaDe(mes.ano, mes.mes0);
  const fim = diaDe(mes.ano, mes.mes0 + 1);
  const precos = useMemo(() => new Map(anunciado.map((d) => [paraDia(d.d), d])), [anunciado]);

  // Por dia: quem ocupa a noite (tarde) e quem saiu de manhã.
  const porNoite = useMemo(() => {
    const mapa = new Map<number, ReservaCalculada>();
    for (const r of reservas) {
      for (let d = Math.max(r.ci, inicio - 1); d < Math.min(r.co, fim + 1); d++) mapa.set(d, r);
    }
    return mapa;
  }, [reservas, inicio, fim]);

  const doMes = useMemo(
    () => reservas.filter((r) => r.co > inicio && r.ci < fim).sort((a, b) => a.ci - b.ci),
    [reservas, inicio, fim],
  );
  const resumo = useMemo(() => metricas(reservas, inicio, fim, primeira), [reservas, inicio, fim, primeira]);
  const reservaSelecionada = doMes.find((r) => r.id === selecionada) ?? null;
  const canaisDoMes = [
    ...CANAIS.filter((c) => doMes.some((r) => canalDe(r.canal) === c.id)),
    ...(doMes.some((r) => canalDe(r.canal) == null) ? [CANAL_DESCONHECIDO] : []),
  ];

  const mudarMes = (delta: number) => {
    const d = new Date(mes.ano, mes.mes0 + delta, 1);
    setMes({ ano: d.getFullYear(), mes0: d.getMonth() });
    setSelecionada(null);
  };

  const vazios = diaDaSemana(inicio);
  const dias = Array.from({ length: fim - inicio }, (_, i) => inicio + i);

  return (
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-3">
      <Cartao
        className="lg:col-span-2"
        titulo={nomeDoMes(mes.ano, mes.mes0).replace(/^./, (c) => c.toUpperCase())}
        subtitulo={
          resumo.disponiveis > 0
            ? `${resumo.noites} de ${resumo.disponiveis} noites reservadas (${pct(resumo.ocupacao)}) · ${reais(resumo.receita)} em diárias`
            : "Sem histórico neste mês"
        }
        acoes={
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs"
              onClick={() => {
                setMes({ ano: base.getFullYear(), mes0: base.getMonth() });
                setSelecionada(null);
              }}
            >
              Hoje
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => mudarMes(-1)} aria-label="Mês anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => mudarMes(1)} aria-label="Próximo mês">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground">
          {SEMANA.map((s) => (
            <div key={s} className="pb-1.5">
              {s}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {Array.from({ length: vazios }, (_, i) => (
            <div key={`v${i}`} />
          ))}
          {dias.map((d) => {
            const noite = porNoite.get(d) ?? null; // ocupa a tarde/noite
            const manha = porNoite.get(d - 1) ?? null; // dormiu a noite anterior
            const saida = manha && manha.co === d ? manha : null;
            const meioDaEstadia = manha && noite && manha.id === noite.id;
            const preco = !noite && d >= hoje ? precos.get(d) : undefined;
            const passado = d < hoje;
            const alvo = noite ?? saida;
            const ativa = (r: ReservaCalculada | null) => !!r && r.id === selecionada;
            const apagada = (r: ReservaCalculada | null) => selecionada != null && !!r && r.id !== selecionada;

            return (
              <button
                key={d}
                type="button"
                disabled={!alvo}
                onClick={() => alvo && setSelecionada((s) => (s === alvo.id ? null : alvo.id))}
                aria-label={
                  `${formatarDia(d, true)}: ` +
                  (noite
                    ? `reservado (${infoCanal(noite.canal).rotulo})`
                    : saida
                      ? "check-out"
                      : preco?.preco_cents
                        ? `livre, ${reais(preco.preco_cents)}`
                        : "livre")
                }
                className={cn(
                  "relative flex h-14 min-w-0 flex-col items-center pt-1 text-xs outline-none md:h-[68px]",
                  alvo && "cursor-pointer focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <span
                  className={cn(
                    "z-10 flex h-5 min-w-5 items-center justify-center rounded-full px-1 tabular-nums",
                    d === hoje ? "bg-foreground font-semibold text-background" : passado ? "text-muted-foreground/70" : "font-medium",
                  )}
                >
                  {deDia(d).getDate()}
                </span>

                {/* faixa das reservas: metade da manhã e metade da tarde */}
                <span className="absolute inset-x-0 bottom-2 flex h-[18px] md:bottom-3 md:h-5" aria-hidden="true">
                  <span
                    className={cn("h-full w-1/2 transition-opacity", manha && !meioDaEstadia && saida && "rounded-r-full", apagada(manha) && "opacity-30")}
                    style={manha ? { background: infoCanal(manha.canal).cor, boxShadow: ativa(manha) ? CONTORNO : undefined } : undefined}
                  />
                  <span
                    className={cn("h-full w-1/2 transition-opacity", noite && noite.ci === d && "rounded-l-full", apagada(noite) && "opacity-30")}
                    style={noite ? { background: infoCanal(noite.canal).cor, boxShadow: ativa(noite) ? CONTORNO : undefined } : undefined}
                  />
                </span>

                {/* em dia de check-out o preço vai para a metade livre (a tarde) */}
                {preco?.preco_cents != null && (
                  <span
                    className={cn(
                      "absolute bottom-2.5 text-center text-[10px] tabular-nums text-muted-foreground md:bottom-[13px] md:text-[11px]",
                      saida ? "left-1/2 w-1/2" : "inset-x-0",
                      !preco.livre && "line-through opacity-60",
                    )}
                  >
                    {Math.round(preco.preco_cents / 100).toLocaleString("pt-BR")}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border/60 pt-3">
          <Legenda itens={canaisDoMes.length > 0 ? canaisDoMes.map((c) => ({ cor: c.cor, rotulo: c.rotulo })) : [{ cor: "hsl(var(--grafico-neutro))", rotulo: "Sem reservas no mês" }]} />
          {anunciado.length > 0 && <p className="text-[11px] text-muted-foreground">Número nas noites livres: preço anunciado (R$)</p>}
        </div>
      </Cartao>

      <Cartao
        titulo={reservaSelecionada ? "Reserva selecionada" : "Reservas do mês"}
        subtitulo={reservaSelecionada ? undefined : doMes.length === 0 ? undefined : "Toque numa reserva para ver os valores"}
        acoes={
          reservaSelecionada ? (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setSelecionada(null)}>
              Ver todas
            </Button>
          ) : undefined
        }
      >
        {reservaSelecionada ? (
          <DetalheReserva reserva={reservaSelecionada} hoje={hoje} comissaoPct={comissaoPct} visaoEquipe={visaoEquipe} />
        ) : doMes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma reserva neste mês.</p>
        ) : (
          <ul className="max-h-[420px] space-y-1.5 overflow-y-auto">
            {doMes.map((r) => {
              const canal = infoCanal(r.canal);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelecionada(r.id)}
                    className="flex w-full items-center gap-2.5 rounded-lg bg-muted/40 px-2.5 py-2 text-left transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: canal.cor }} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium tabular-nums">
                        {formatarDia(r.ci)} → {formatarDia(r.co)}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {canal.rotulo} · {r.noites} {r.noites === 1 ? "noite" : "noites"}
                        {r.hospedes ? ` · ${r.hospedes} hósp.` : ""}
                        {visaoEquipe && r.hospede ? ` · ${r.hospede}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-medium tabular-nums">{reais(r.diarias)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>
    </div>
  );
}
