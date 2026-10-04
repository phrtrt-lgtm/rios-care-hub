import { useEffect, useRef, useState, type ReactNode } from "react";
import { animate, useReducedMotion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Building2, CalendarClock, MapPin, Minus, RefreshCw, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { TOM, type Tom } from "@/components/painel/tons";
import { Etiqueta } from "@/components/painel/Etiqueta";
import { Minigrafico } from "./graficos";
import {
  formatarDia,
  infoCanal,
  liquidoEstimado,
  pct,
  reais,
  situacaoDaReserva,
  type Adiante,
  type Destaque,
  type ReservaCalculada,
  type ResultadoImovel,
} from "@/lib/resultadosImovel";

/* ------------------------------------------------------------------------ */
/* Cartão                                                                    */
/* ------------------------------------------------------------------------ */

interface CartaoProps {
  titulo: string;
  subtitulo?: ReactNode;
  acoes?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Cartão padrão da página: título, linha de apoio e conteúdo. */
export function Cartao({ titulo, subtitulo, acoes, children, className }: CartaoProps) {
  return (
    <section className={cn("min-w-0 rounded-xl border border-border/70 bg-card p-4 shadow-sm md:p-5", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight md:text-[15px]">{titulo}</h3>
          {subtitulo && <p className="mt-0.5 text-xs text-muted-foreground">{subtitulo}</p>}
        </div>
        {acoes && <div className="flex shrink-0 items-center gap-1.5">{acoes}</div>}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Número com contagem animada                                               */
/* ------------------------------------------------------------------------ */

/** Anima de onde o número estava até o valor novo (respeita "reduzir movimento"). */
export function useContagem(valor: number, duracao = 0.9): number {
  const reduzido = useReducedMotion();
  const [exibido, setExibido] = useState(reduzido ? valor : 0);
  const anterior = useRef(0);
  useEffect(() => {
    if (reduzido) {
      setExibido(valor);
      anterior.current = valor;
      return;
    }
    const controle = animate(anterior.current, valor, {
      duration: duracao,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: setExibido,
    });
    anterior.current = valor;
    return () => controle.stop();
  }, [valor, duracao, reduzido]);
  return exibido;
}

/** Variação contra o período anterior: seta, percentual e a que se compara. */
export function Variacao({ valor, emPontos, className }: { valor: number | null; emPontos?: boolean; className?: string }) {
  if (valor == null) return null;
  const neutro = Math.abs(valor) < 0.005;
  const sobe = valor > 0;
  const Icone = neutro ? Minus : sobe ? ArrowUpRight : ArrowDownRight;
  const texto = emPontos
    ? `${sobe ? "+" : ""}${Math.round(valor * 100)} p.p.`
    : `${sobe ? "+" : ""}${pct(valor)}`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
        neutro ? "text-muted-foreground" : sobe ? "text-success" : "text-destructive",
        className,
      )}
    >
      <Icone className="h-3.5 w-3.5" aria-hidden="true" />
      {texto}
      <span className="sr-only">{sobe ? "acima" : "abaixo"} do período anterior</span>
    </span>
  );
}

interface CifraProps {
  rotulo: string;
  valor: number;
  formatar: (n: number) => string;
  icone: ReactNode;
  tom?: Tom;
  variacao?: number | null;
  variacaoEmPontos?: boolean;
  detalhe?: ReactNode;
  /** Últimos meses, para a linha de tendência */
  tendencia?: number[];
  /** O número que a página destaca: maior, ocupa duas colunas. Um por tela. */
  principal?: boolean;
  className?: string;
}

/** Cartão de número: valor, variação contra o período anterior e tendência. */
export function Cifra({
  rotulo,
  valor,
  formatar,
  icone,
  tom = "neutral",
  variacao,
  variacaoEmPontos,
  detalhe,
  tendencia,
  principal = false,
  className,
}: CifraProps) {
  const exibido = useContagem(valor);
  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col justify-between gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-sm",
        principal && "col-span-2",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg [&>svg]:h-4 [&>svg]:w-4", TOM[tom].caixa)} aria-hidden="true">
          {icone}
        </span>
        {tendencia && tendencia.length > 1 && <Minigrafico valores={tendencia} className="shrink-0" />}
      </div>
      <div className="min-w-0">
        <p className={cn("font-semibold leading-none tracking-tight", principal ? "text-[34px] md:text-5xl" : "text-2xl md:text-[28px]")}>
          {formatar(exibido)}
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-medium text-muted-foreground md:text-[13px]">
          {rotulo}
          <Variacao valor={variacao ?? null} emPontos={variacaoEmPontos} />
        </p>
        {detalhe && <p className="mt-0.5 text-xs leading-snug text-muted-foreground/80">{detalhe}</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Topo da página                                                            */
/* ------------------------------------------------------------------------ */

interface HeroProps {
  dados: ResultadoImovel;
  adiante: Adiante;
  hoje: number;
}

/**
 * Faixa de abertura: nome do imóvel, foto de capa e o que acontece agora.
 * O fundo é a animação "RIOS fluxo" (Remotion, ver motion/rios-fluxo); com
 * "reduzir movimento" ligado fica só o quadro parado.
 */
export function HeroResultados({ dados, adiante, hoje }: HeroProps) {
  const reduzido = useReducedMotion();
  const { imovel } = dados;

  let agora: { texto: string; ativo: boolean };
  if (adiante.emCasa) {
    agora = { texto: `Hóspedes no imóvel até ${formatarDia(adiante.emCasa.co)}`, ativo: true };
  } else if (adiante.proxima) {
    const dias = adiante.proxima.ci - hoje;
    agora = {
      texto:
        dias <= 0
          ? "Check-in hoje"
          : `Livre hoje · próximo check-in ${dias === 1 ? "amanhã" : `em ${dias} dias`} (${formatarDia(adiante.proxima.ci)})`,
      ativo: false,
    };
  } else {
    agora = { texto: "Sem reservas futuras no momento", ativo: false };
  }

  return (
    <section className="relative isolate overflow-hidden rounded-2xl bg-secondary text-secondary-foreground shadow-lg">
      {reduzido ? (
        <img src="/animacoes/rios-fluxo-poster.jpg" alt="" aria-hidden="true" className="absolute inset-0 -z-10 h-full w-full object-cover" />
      ) : (
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/animacoes/rios-fluxo-poster.jpg"
          aria-hidden="true"
          tabIndex={-1}
          className="absolute inset-0 -z-10 h-full w-full object-cover"
        >
          <source src="/animacoes/rios-fluxo.webm" type="video/webm" />
          <source src="/animacoes/rios-fluxo.mp4" type="video/mp4" />
        </video>
      )}
      {/* escurece o lado do texto para a leitura não depender do quadro do vídeo */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-secondary/90 via-secondary/55 to-transparent" aria-hidden="true" />

      <div className="flex items-center gap-4 p-5 md:gap-8 md:p-7">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary-foreground/70">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Resultados do imóvel
          </p>
          <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-tight md:text-4xl">{imovel.nome}</h2>
          {imovel.endereco && (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-secondary-foreground/75 md:text-sm">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="line-clamp-2">{imovel.endereco}</span>
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-background/10 px-3 py-1.5 text-xs font-medium backdrop-blur-sm">
              <span className="relative flex h-2 w-2 shrink-0">
                {agora.ativo && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-70 motion-reduce:hidden" />}
                <span className={cn("relative inline-flex h-2 w-2 rounded-full", agora.ativo ? "bg-success" : "bg-secondary-foreground/60")} />
              </span>
              <span className="truncate">{agora.texto}</span>
            </span>
            {dados.coletado_em && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-secondary-foreground/65">
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                Atualizado {formatDistanceToNow(new Date(dados.coletado_em), { addSuffix: true, locale: ptBR })}
              </span>
            )}
          </div>
        </div>

        <div className="hidden w-52 shrink-0 overflow-hidden rounded-xl shadow-xl ring-1 ring-background/20 sm:block md:w-72">
          {imovel.capa ? (
            <img src={imovel.capa} alt={`Foto de ${imovel.nome}`} loading="lazy" className="aspect-[16/10] w-full object-cover" />
          ) : (
            <div className="flex aspect-[16/10] w-full items-center justify-center bg-background/10">
              <Building2 className="h-9 w-9 text-secondary-foreground/60" aria-hidden="true" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Detalhe de uma reserva                                                    */
/* ------------------------------------------------------------------------ */

function LinhaValor({ rotulo, valor, forte, sinal }: { rotulo: ReactNode; valor: string; forte?: boolean; sinal?: "menos" }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 text-sm", forte && "border-t border-border/60 pt-2 font-semibold")}>
      <span className={cn("min-w-0", !forte && "text-muted-foreground")}>{rotulo}</span>
      <span className="shrink-0 tabular-nums">
        {sinal === "menos" && valor !== reais(0, 2) ? "− " : ""}
        {valor}
      </span>
    </div>
  );
}

/**
 * Como o valor de uma reserva (ou de um período) se divide. Mesma conta do
 * relatório financeiro: diárias − taxa do canal − comissão RIOS = líquido.
 * O líquido é estimativa; o oficial é o do relatório.
 */
export function DivisaoDoValor({
  diarias,
  taxaCanal,
  limpeza,
  comissaoPct,
}: {
  diarias: number;
  taxaCanal: number;
  limpeza: number;
  comissaoPct: number | null;
}) {
  const base = Math.max(0, diarias - taxaCanal);
  const liquido = liquidoEstimado(base, comissaoPct);
  return (
    <div className="space-y-2">
      <LinhaValor rotulo="Diárias" valor={reais(diarias, 2)} />
      <LinhaValor rotulo="Taxa do canal (Airbnb, Booking…)" valor={reais(taxaCanal, 2)} sinal="menos" />
      {liquido != null ? (
        <>
          <LinhaValor rotulo={`Comissão RIOS (${comissaoPct!.toLocaleString("pt-BR")}%)`} valor={reais(base - liquido, 2)} sinal="menos" />
          <LinhaValor rotulo="Seu líquido estimado" valor={reais(liquido, 2)} forte />
        </>
      ) : (
        <LinhaValor rotulo="Diárias após a taxa do canal" valor={reais(base, 2)} forte />
      )}
      {limpeza > 0 && (
        <p className="pt-1 text-[11px] leading-snug text-muted-foreground">
          Taxa de limpeza paga pelo hóspede ({reais(limpeza, 2)}): vai para a limpeza e não entra nas diárias.
        </p>
      )}
    </div>
  );
}

export function DetalheReserva({
  reserva,
  hoje,
  comissaoPct,
  visaoEquipe,
}: {
  reserva: ReservaCalculada;
  hoje: number;
  comissaoPct: number | null;
  visaoEquipe: boolean;
}) {
  const canal = infoCanal(reserva.canal);
  const situacao = situacaoDaReserva(reserva, hoje);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: canal.cor }} aria-hidden="true" />
          {canal.rotulo}
        </span>
        <Etiqueta tom={situacao.tom}>{situacao.rotulo}</Etiqueta>
        {visaoEquipe && reserva.hospede && <span className="text-xs text-muted-foreground">· {reserva.hospede}</span>}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Check-in</dt>
          <dd className="font-medium tabular-nums">{formatarDia(reserva.ci, true)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Check-out</dt>
          <dd className="font-medium tabular-nums">{formatarDia(reserva.co, true)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Noites</dt>
          <dd className="font-medium tabular-nums">{reserva.noites}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Hóspedes</dt>
          <dd className="font-medium tabular-nums">{reserva.hospedes ?? "—"}</dd>
        </div>
      </dl>

      <DivisaoDoValor
        diarias={reserva.diarias}
        taxaCanal={reserva.taxa_canal_cents}
        limpeza={reserva.limpeza_cents}
        comissaoPct={comissaoPct}
      />

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Diária média de {reais(reserva.diariaMedia)}
        {reserva.antecedencia != null &&
          ` · reservada com ${reserva.antecedencia} ${reserva.antecedencia === 1 ? "dia" : "dias"} de antecedência`}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Destaques                                                                 */
/* ------------------------------------------------------------------------ */

/** Frases que resumem o período, calculadas a partir dos mesmos números da página. */
export function Destaques({ itens }: { itens: Destaque[] }) {
  if (itens.length === 0) return null;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {itens.map((d) => (
        <li key={d.id} className={cn("flex min-w-0 gap-3 rounded-xl border bg-card p-3.5 shadow-sm", TOM[d.tom].borda)}>
          <span className={cn("mt-0.5 h-8 w-1 shrink-0 rounded-full", TOM[d.tom].ponto)} aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug">{d.titulo}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{d.texto}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
