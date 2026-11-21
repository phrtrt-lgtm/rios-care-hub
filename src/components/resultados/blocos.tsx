import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { animate, motion, useReducedMotion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Building2, CalendarClock, MapPin, Minus, Play, RefreshCw, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { TOM, type Tom } from "@/components/painel/tons";
import { Etiqueta } from "@/components/painel/Etiqueta";
import { Minigrafico } from "./graficos";
import {
  capaGrande,
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
/* Entrada ao rolar                                                          */
/* ------------------------------------------------------------------------ */

/**
 * Bloco que sobe de leve quando entra na tela, uma vez só. Envolve a linha
 * inteira (a grade), não cada cartão, para não mudar o desenho da grade.
 */
export function Revelar({ children, className, atraso = 0 }: { children: ReactNode; className?: string; atraso?: number }) {
  const reduzido = useReducedMotion();
  if (reduzido) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -48px 0px" }}
      transition={{ duration: 0.5, delay: atraso, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------------ */
/* Cartão                                                                    */
/* ------------------------------------------------------------------------ */

interface CartaoProps {
  /** Para o Paulo do topo apontar para o cartão (ver `irAteOAlvo`). */
  id?: string;
  titulo: string;
  subtitulo?: ReactNode;
  acoes?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Cartão padrão da página: título, linha de apoio e conteúdo. */
export function Cartao({ id, titulo, subtitulo, acoes, children, className }: CartaoProps) {
  return (
    <section id={id} className={cn("min-w-0 rounded-xl border border-border/70 bg-card p-4 shadow-sm md:p-5", className)}>
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
  /** Botão da história do último mês fechado; ausente quando o imóvel ainda não tem mês fechado com reserva. */
  resumo?: { rotulo: string; novo: boolean; onAbrir: () => void };
  /**
   * O Mini Paulo (`PauloNoTopo`), por cima da faixa. Com ele a faixa muda de
   * desenho: fica mais alta, e a foto do imóvel vira o fundo do lado direito
   * também em tela larga, com o Paulo na frente dela.
   */
  paulo?: ReactNode;
}

/**
 * Faixa de abertura: nome do imóvel, foto de capa e o que acontece agora.
 * O fundo é a animação "RIOS fluxo" (Remotion, ver motion/rios-fluxo); com
 * "reduzir movimento" ligado fica só o quadro parado. No celular não cabe a
 * foto ao lado, então ela vira o fundo da faixa, se aproximando devagar.
 */
export function HeroResultados({ dados, adiante, hoje, resumo, paulo }: HeroProps) {
  const reduzido = useReducedMotion();
  const { imovel } = dados;
  const comPaulo = !!paulo;
  // Capa maior que a miniatura guardada; se o CDN recusar, volta para a original.
  const [capa, setCapa] = useState(() => capaGrande(imovel.capa, 960));

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

  // Até onde a foto é o fundo da faixa: só no celular; com o Paulo, até a tela larga.
  const fundoSoNoLargo = capa && (comPaulo ? "hidden lg:block" : "hidden sm:block");

  const faixa = (
    <section className="relative isolate overflow-hidden rounded-2xl bg-secondary text-secondary-foreground shadow-lg">
      {reduzido ? (
        <img src="/animacoes/rios-fluxo-poster.jpg" alt="" aria-hidden="true" className={cn("absolute inset-0 -z-10 h-full w-full object-cover", fundoSoNoLargo)} />
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
          className={cn("absolute inset-0 -z-10 h-full w-full object-cover", fundoSoNoLargo)}
        >
          <source src="/animacoes/rios-fluxo.webm" type="video/webm" />
          <source src="/animacoes/rios-fluxo.mp4" type="video/mp4" />
        </video>
      )}
      {/* celular: a foto do imóvel é o fundo */}
      {capa && (
        <img
          src={capa}
          alt=""
          aria-hidden="true"
          onError={() => setCapa((atual) => (atual !== imovel.capa ? imovel.capa : null))}
          className={cn("absolute inset-0 -z-10 h-full w-full object-cover motion-safe:animate-aproximar-foto", comPaulo ? "lg:hidden" : "sm:hidden")}
        />
      )}
      {/* com o Paulo, em tela larga: a foto ocupa o lado direito da faixa e se desfaz no azul do lado do texto */}
      {capa && comPaulo && (
        <img
          src={capa}
          alt={`Foto de ${imovel.nome}`}
          onError={() => setCapa((atual) => (atual !== imovel.capa ? imovel.capa : null))}
          className="absolute inset-y-0 right-0 -z-10 hidden h-full w-[62%] object-cover [mask-image:linear-gradient(to_right,transparent,black_42%)] lg:block"
        />
      )}
      {/* escurece o lado do texto para a leitura não depender do quadro do vídeo (no celular, da foto) */}
      <div
        className={cn(
          "absolute inset-0 -z-10",
          comPaulo
            ? cn(
                // celular: azul cheio atrás do texto, foto limpa em cima (é onde o Paulo e o balão ficam)
                capa
                  ? "bg-[linear-gradient(to_top,hsl(var(--secondary))_0%,hsl(var(--secondary)_/_0.95)_36%,hsl(var(--secondary)_/_0.3)_62%,hsl(var(--secondary)_/_0.08)_100%)]"
                  : "bg-gradient-to-r from-secondary/90 via-secondary/55 to-transparent",
                "lg:bg-[linear-gradient(to_right,hsl(var(--secondary)_/_0.94)_0%,hsl(var(--secondary)_/_0.78)_38%,hsl(var(--secondary)_/_0.12)_70%,hsl(var(--secondary)_/_0)_100%)]",
              )
            : cn(
                "sm:bg-gradient-to-r sm:from-secondary/90 sm:via-secondary/55 sm:to-transparent",
                capa ? "bg-gradient-to-t from-secondary via-secondary/85 to-secondary/10" : "bg-gradient-to-r from-secondary/90 via-secondary/55 to-transparent",
              ),
        )}
        aria-hidden="true"
      />

      <div
        className={cn(
          "flex items-end",
          comPaulo ? "min-h-[424px] p-5 md:p-7 lg:min-h-[300px] lg:items-center" : "gap-4 p-5 sm:items-center md:gap-8 md:p-7",
          !comPaulo && capa && "min-h-[330px] sm:min-h-0",
        )}
      >
        <div className={cn("min-w-0 flex-1", comPaulo && "lg:max-w-[44%]")}>
          {/* com o Paulo no celular, o nome fica ao lado dele: não pode passar por baixo (no joinha a mão chega a 56% da largura) */}
          <div className={cn(comPaulo && "max-w-[54%] lg:max-w-none")}>
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
          </div>

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

          {resumo && (
            <button
              type="button"
              onClick={resumo.onAbrir}
              // claro sobre o azul nos dois temas (bg-background ficaria escuro no tema escuro)
              className="group mt-4 inline-flex max-w-full items-center gap-2.5 rounded-full bg-secondary-foreground py-1.5 pl-1.5 pr-4 text-sm font-semibold text-secondary shadow-lg transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-foreground/70 focus-visible:ring-offset-2 focus-visible:ring-offset-secondary active:scale-[0.98] motion-reduce:transition-none"
            >
              <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                {resumo.novo && <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" aria-hidden="true" />}
                <Play className="relative h-3.5 w-3.5 translate-x-px fill-current" aria-hidden="true" />
              </span>
              <span className="truncate">{resumo.rotulo}</span>
              {resumo.novo && <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">Novo</span>}
            </button>
          )}
        </div>

        {!comPaulo && (
          <div className="hidden w-52 shrink-0 overflow-hidden rounded-xl shadow-xl ring-1 ring-background/20 sm:block md:w-72">
            {capa ? (
              <img
                src={capa}
                alt={`Foto de ${imovel.nome}`}
                loading="lazy"
                onError={() => setCapa((atual) => (atual !== imovel.capa ? imovel.capa : null))}
                className="aspect-[16/10] w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[16/10] w-full items-center justify-center bg-background/10">
                <Building2 className="h-9 w-9 text-secondary-foreground/60" aria-hidden="true" />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );

  if (!paulo) return faixa;
  // O Paulo fica fora da moldura arredondada: a caixa dele passa do topo da faixa.
  return (
    <div className="relative">
      {faixa}
      {paulo}
    </div>
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
        {reserva.fonte === "relatorio" && (
          <Etiqueta tom="neutral" title="Veio do relatório financeiro do mês, não da integração com a Hostex">
            Do relatório financeiro
          </Etiqueta>
        )}
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
/* Próximas chegadas                                                         */
/* ------------------------------------------------------------------------ */

/**
 * Quem está no imóvel agora e as próximas reservas, em cartões: datas, noites,
 * hóspedes, canal e diárias. No celular os cartões rolam para o lado. Nada de
 * nome de hóspede aqui (regra nº 5); a equipe vê os nomes na aba Reservas.
 */
export function ProximasChegadas({ reservas, hoje, onVerTodas }: { reservas: ReservaCalculada[]; hoje: number; onVerTodas?: () => void }) {
  const lista = useMemo(() => {
    const emCasa = reservas.filter((r) => r.ci <= hoje && hoje < r.co);
    const futuras = reservas.filter((r) => r.ci > hoje).sort((a, b) => a.ci - b.ci);
    return [...emCasa, ...futuras].slice(0, 4);
  }, [reservas, hoje]);

  if (lista.length === 0) return null;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-tight md:text-[15px]">Próximas chegadas</h3>
        {onVerTodas && (
          <button
            type="button"
            onClick={onVerTodas}
            className="shrink-0 rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ver todas as reservas
          </button>
        )}
      </div>
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden">
        {lista.map((r) => {
          const canal = infoCanal(r.canal);
          const emCasa = r.ci <= hoje;
          const dias = r.ci - hoje;
          const quando = emCasa ? "No imóvel agora" : dias === 1 ? "Amanhã" : `Em ${dias} dias`;
          return (
            <li
              key={r.id}
              className={cn(
                "flex w-[72%] shrink-0 snap-start flex-col rounded-xl border bg-card p-3.5 shadow-sm sm:w-[44%] md:w-auto",
                emCasa ? "border-success/40" : "border-border/70",
              )}
            >
              <p className={cn("flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide", emCasa ? "text-success" : "text-muted-foreground")}>
                {emCasa && (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-70 motion-reduce:hidden" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                  </span>
                )}
                {quando}
              </p>
              <p className="mt-1.5 text-base font-semibold tabular-nums leading-tight">
                {formatarDia(r.ci)} <span className="font-normal text-muted-foreground">→</span> {formatarDia(r.co)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {r.noites} {r.noites === 1 ? "noite" : "noites"}
                {r.hospedes ? ` · ${r.hospedes} ${r.hospedes === 1 ? "hóspede" : "hóspedes"}` : ""}
              </p>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: canal.cor }} aria-hidden="true" />
                  <span className="truncate">{canal.rotulo}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{reais(r.diarias)}</span>
              </div>
            </li>
          );
        })}
      </ul>
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
