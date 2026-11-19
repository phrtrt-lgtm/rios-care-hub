import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { CalendarCheck, Moon, Rotate3d, Trophy, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CANAIS,
  CANAL_DESCONHECIDO,
  canalDe,
  diaDaSemana,
  formatarDiaExtenso,
  infoCanal,
  nomeDoMes,
  paraDia,
  pct,
  reais,
  type DiaAnunciado,
  type Periodo,
  type ReservaCalculada,
} from "@/lib/resultadosImovel";
import { COR, Legenda } from "../graficos";
import { criarCenaRelevo, type ApontadoNoRelevo, type CenaRelevo } from "./relevoCena";
import { montarRelevo, type MesDoRelevo } from "./relevoModelo";

interface Props {
  reservas: ReservaCalculada[];
  /** Os meses da linha do tempo da página, do mais antigo ao mais novo */
  meses: MesDoRelevo[];
  hoje: number;
  primeira: number | null;
  /** Período escolhido na página: o que fica fora dele esmaece */
  selecao: Periodo;
  /** Preço anunciado dos próximos dias, para a dica das noites livres */
  calendario?: DiaAnunciado[];
  onSelecionarMes?: (mes: MesDoRelevo) => void;
}

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/**
 * O ano do imóvel em 3D: uma linha por mês, um bloco por noite reservada, com a
 * altura pela diária. Gira com o dedo, mostra a reserva ao toque e o nome de
 * cada mês filtra a página por ele. É outra forma de ver o que os gráficos já
 * contam; os números exatos continuam neles e na tabela.
 *
 * Este arquivo e os da pasta trazem o three.js: carregue sempre por `lazyPage`.
 */
export default function RelevoDoAno({ reservas, meses, hoje, primeira, selecao, calendario, onSelecionarMes }: Props) {
  const reduzido = useReducedMotion();
  const caixa = useRef<HTMLDivElement>(null);
  const rotulos = useRef<(HTMLElement | null)[]>([]);
  const marcaHoje = useRef<HTMLDivElement>(null);
  const dicaRef = useRef<HTMLDivElement>(null);
  const cena = useRef<CenaRelevo | null>(null);
  const periodo = useRef(selecao);
  const [dica, setDica] = useState<ApontadoNoRelevo | null>(null);
  const [falhou, setFalhou] = useState(false);

  const modelo = useMemo(() => montarRelevo(reservas, meses, hoje, primeira), [reservas, meses, hoje, primeira]);
  const anunciado = useMemo(() => new Map((calendario ?? []).map((d) => [paraDia(d.d), d])), [calendario]);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const nova = criarCenaRelevo(el, modelo, {
      reduzido: !!reduzido,
      periodo: periodo.current,
      rotulos,
      marcaHoje,
      dica: dicaRef,
      aoApontar: setDica,
    });
    if (!nova) {
      setFalhou(true);
      return;
    }
    cena.current = nova;
    // toque fora da peça fecha a dica
    const aoTocarFora = (e: PointerEvent) => {
      if (!el.contains(e.target as Node)) nova.soltar();
    };
    document.addEventListener("pointerdown", aoTocarFora);
    return () => {
      document.removeEventListener("pointerdown", aoTocarFora);
      nova.destruir();
      cena.current = null;
      setDica(null);
    };
  }, [modelo, reduzido]);

  useEffect(() => {
    periodo.current = selecao;
    cena.current?.marcarPeriodo(selecao.inicio, selecao.fim);
  }, [selecao]);

  const canais = useMemo(() => {
    const vistos = new Set(modelo.reservas.map((r) => canalDe(r.canal) ?? "desconhecido"));
    return [...CANAIS, CANAL_DESCONHECIDO].filter((c) => vistos.has(c.id));
  }, [modelo]);

  // Três marcas da janela, ao lado do relevo. As duas primeiras apontam a reserva na peça; a do mês filtra a página.
  const recordes = useMemo(() => {
    const lista: {
      id: string;
      icone: LucideIcon;
      rotulo: string;
      valor: string;
      detalhe: string;
      acao: () => void;
    }[] = [];
    const rs = modelo.reservas;
    if (rs.length === 0) return lista;
    let cara = 0;
    let longa = 0;
    rs.forEach((r, i) => {
      if (r.diariaMedia > rs[cara].diariaMedia) cara = i;
      if (r.noites > rs[longa].noites) longa = i;
    });
    const trecho = (r: ReservaCalculada) => `${formatarDiaExtenso(r.ci)} a ${formatarDiaExtenso(r.co)}`;
    lista.push({
      id: "diaria",
      icone: Trophy,
      rotulo: "Diária mais alta",
      valor: reais(rs[cara].diariaMedia),
      detalhe: trecho(rs[cara]),
      acao: () => cena.current?.focarReserva(cara),
    });
    lista.push({
      id: "estadia",
      icone: Moon,
      rotulo: "Estadia mais longa",
      valor: `${rs[longa].noites} ${rs[longa].noites === 1 ? "noite" : "noites"}`,
      detalhe: trecho(rs[longa]),
      acao: () => cena.current?.focarReserva(longa),
    });
    const fechados = meses.filter((m) => !m.futuro && !m.atual && m.ocupacao != null && m.ocupacao > 0);
    if (fechados.length > 0) {
      const cheio = fechados.reduce((a, b) => ((b.ocupacao ?? 0) > (a.ocupacao ?? 0) ? b : a));
      lista.push({
        id: "mes",
        icone: CalendarCheck,
        rotulo: "Mês mais cheio",
        valor: pct(cheio.ocupacao ?? 0),
        detalhe: nomeDoMes(cheio.ano, cheio.mes0),
        acao: () => onSelecionarMes?.(cheio),
      });
    }
    return lista;
  }, [modelo, meses, onSelecionarMes]);

  if (falhou) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">Este aparelho não desenha a vista em 3D. Os mesmos números estão nos gráficos abaixo.</p>
    );
  }

  // no celular os nomes dos meses ficam apertados: mostra um sim, um não, sempre com o mês atual
  const linhaAtual = Math.max(
    0,
    meses.findIndex((m) => hoje >= m.inicio && hoje < m.fim),
  );
  const descricao = `Relevo de ${meses.length} meses: ${modelo.noitesPassadas} noites que já aconteceram e ${modelo.noitesFuturas} já reservadas à frente. Os números de cada mês estão nos gráficos e na tabela desta página.`;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_232px] lg:gap-6">
      <div className="min-w-0">
        <div className="relative h-[290px] select-none sm:h-[400px] lg:h-[430px]">
          <div ref={caixa} role="img" aria-label={descricao} className="absolute inset-0" />

          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {meses.map((m, i) => {
              const ativo = m.inicio < selecao.fim && m.fim > selecao.inicio;
              return (
                <button
                  key={m.chave}
                  type="button"
                  ref={(el) => {
                    rotulos.current[i] = el;
                  }}
                  onClick={() => onSelecionarMes?.(m)}
                  aria-label={`Filtrar a página por ${m.rotulo} de ${m.ano}`}
                  className={cn(
                    "pointer-events-auto absolute left-0 top-0 whitespace-nowrap rounded px-1 py-0.5 text-[10px] font-medium leading-none opacity-0 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-[11px]",
                    ativo ? "text-foreground" : "text-muted-foreground/70",
                    (i - linhaAtual) % 2 !== 0 && "hidden sm:block",
                  )}
                >
                  {m.rotulo}
                  {(m.mes0 === 0 || i === 0) && <span className="ml-0.5 tabular-nums opacity-70">{String(m.ano).slice(2)}</span>}
                </button>
              );
            })}

            {modelo.hoje && (
              <div
                ref={marcaHoje}
                className="absolute left-0 top-0 rounded-full bg-foreground px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wide text-background opacity-0"
              >
                hoje
              </div>
            )}

            {dica && (
              <div
                ref={dicaRef}
                role="status"
                className="absolute left-0 top-0 z-10 w-max max-w-[228px] rounded-lg border border-border/70 bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-md"
                style={{
                  transform: `translate3d(${dica.x.toFixed(1)}px, ${dica.y.toFixed(1)}px, 0) translate(-50%, -100%)`,
                }}
              >
                {dica.reserva ? (
                  <DicaDaReserva reserva={dica.reserva} hoje={hoje} />
                ) : (
                  <DicaDoDiaLivre dia={dica.dia} hoje={hoje} anunciado={anunciado.get(dica.dia)} />
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Legenda
            itens={[
              ...canais.map((c) => ({ cor: c.cor, rotulo: c.rotulo })),
              ...(modelo.noitesFuturas > 0 ? [{ cor: COR.serie1Clara, rotulo: "Já reservado à frente" }] : []),
            ]}
          />
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Rotate3d className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Arraste para girar. Toque num bloco para ver a reserva.
          </p>
        </div>
      </div>

      {recordes.length > 0 && (
        <div className="lg:flex lg:flex-col lg:justify-center">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Recordes destes meses</p>
          <ul className="grid gap-2 md:grid-cols-3 lg:grid-cols-1">
            {recordes.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={r.acao}
                  className="group flex w-full items-center gap-3 rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-110 motion-reduce:transform-none">
                    <r.icone className="h-4 w-4" aria-hidden="true" />
                  </span>
                  {/* no celular o valor vai à direita, numa linha só; de tablet para cima, embaixo do rótulo */}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] text-muted-foreground">{r.rotulo}</span>
                    <span className="hidden text-base font-semibold leading-tight tabular-nums md:block">{r.valor}</span>
                    <span className="block truncate text-[11px] text-muted-foreground first-letter:uppercase">{r.detalhe}</span>
                  </span>
                  <span className="shrink-0 text-base font-semibold tabular-nums md:hidden">{r.valor}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DicaDaReserva({ reserva, hoje }: { reserva: ReservaCalculada; hoje: number }) {
  const canal = infoCanal(reserva.canal);
  const momento = reserva.ci >= hoje ? "Já reservada" : reserva.co > hoje ? "Em andamento" : null;
  return (
    <>
      <p className="font-medium">
        {formatarDiaExtenso(reserva.ci)} a {formatarDiaExtenso(reserva.co)}
      </p>
      <p className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
        <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: canal.cor }} aria-hidden="true" />
        {canal.rotulo} · {reserva.noites} {reserva.noites === 1 ? "noite" : "noites"}
      </p>
      <p className="mt-1 tabular-nums">
        <span className="font-semibold">{reais(reserva.diarias)}</span> em diárias
      </p>
      <p className="tabular-nums text-muted-foreground">
        {reais(reserva.diariaMedia)} por noite
        {momento ? ` · ${momento.toLowerCase()}` : ""}
      </p>
      {reserva.hospede && <p className="mt-1 truncate text-muted-foreground">{reserva.hospede}</p>}
    </>
  );
}

function DicaDoDiaLivre({ dia, hoje, anunciado }: { dia: number; hoje: number; anunciado?: DiaAnunciado }) {
  let texto = "Noite sem reserva";
  if (dia >= hoje) {
    if (anunciado && !anunciado.livre) texto = "Fechada no calendário";
    else if (anunciado?.preco_cents) texto = `Livre · anunciada a ${reais(anunciado.preco_cents)}`;
    else texto = "Livre por enquanto";
  }
  return (
    <>
      <p className="font-medium">
        {SEMANA[diaDaSemana(dia)]}, {formatarDiaExtenso(dia)}
      </p>
      <p className="mt-0.5 text-muted-foreground">{texto}</p>
    </>
  );
}
