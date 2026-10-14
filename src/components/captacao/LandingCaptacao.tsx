// Landing de captação (/cadastro-imovel), sem rolagem de página: no desktop,
// painel da marca à esquerda e formulário à direita cabendo na tela; no
// celular, duas telas (painel e formulário) que deslizam de lado. O
// conteúdo vem de conteudo.ts.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  ExternalLink,
  Instagram,
  Mail,
  Pause,
  Play,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import riosLogo from "@/assets/rios-logo.png";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CIDADES, INCLUSOS, LINKS, NUMEROS, RESULTADOS } from "./conteudo";

export const ID_FORMULARIO = "cadastro";
const LARGURA_DESKTOP = 1024;

/** true a partir de 1024 px (duas colunas). Lido já na montagem, para não piscar o layout errado. */
export function useTelaLarga() {
  const [larga, setLarga] = useState(() => (typeof window === "undefined" ? true : window.innerWidth >= LARGURA_DESKTOP));
  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${LARGURA_DESKTOP}px)`);
    const ler = () => setLarga(mql.matches);
    mql.addEventListener("change", ler);
    ler();
    return () => mql.removeEventListener("change", ler);
  }, []);
  return larga;
}

function LinkExterno({ href, className, children, ...resto }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} {...resto}>
      {children}
    </a>
  );
}

/* ------------------------------------------------------------------------ */
/* Cabeçalho (uma linha) e contatos                                          */
/* ------------------------------------------------------------------------ */

export function CabecalhoCaptacao() {
  return (
    <header className="relative shrink-0">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[hsl(var(--rios-blue))] via-[hsl(var(--rios-blue-light))] to-[hsl(var(--rios-terra))]" />
      <div className="container mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <LinkExterno href={LINKS.site} className="flex items-center gap-3" aria-label="Site da RIOS Hospedagens">
          <img src={riosLogo} alt="RIOS Hospedagens" className="h-8 w-auto object-contain" />
          <span className="hidden text-[11px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--rios-blue))] sm:inline">
            Hospedagens
          </span>
        </LinkExterno>
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <LinkExterno href={LINKS.site}>
            Conhecer a RIOS
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </LinkExterno>
        </Button>
      </div>
    </header>
  );
}

/** Site, Instagram e e-mail numa linha. `escuro` para dentro do painel. */
export function ContatoCaptacao({ escuro, className }: { escuro?: boolean; className?: string }) {
  const cor = escuro
    ? "text-secondary-foreground/70 hover:text-secondary-foreground"
    : "text-muted-foreground hover:text-foreground";
  return (
    <nav aria-label="Contato" className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs", className)}>
      <LinkExterno href={LINKS.site} className={cn("inline-flex items-center gap-1 transition-colors", cor)}>
        rioshospedagens.com.br
        <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
      </LinkExterno>
      <LinkExterno href={LINKS.instagram} className={cn("inline-flex items-center gap-1 transition-colors", cor)}>
        <Instagram className="h-3.5 w-3.5" aria-hidden="true" />
        @rioshospedagens
      </LinkExterno>
      <a href={`mailto:${LINKS.email}`} className={cn("inline-flex items-center gap-1 transition-colors", cor)}>
        <Mail className="h-3.5 w-3.5" aria-hidden="true" />
        E-mail
      </a>
    </nav>
  );
}

/* ------------------------------------------------------------------------ */
/* Painel da marca                                                           */
/* ------------------------------------------------------------------------ */

const PLATAFORMAS = ["Airbnb", "Booking", "Expedia", "Google"];

interface PainelMarcaProps {
  /** No celular: botão que leva à tela do formulário. */
  aoCadastrar?: () => void;
  className?: string;
}

/** Reel dos imóveis RIOS (montado por motion/captacao-reel/monta-reel.py). */
const REEL = {
  poster: "/videos/captacao/imoveis-poster.jpg",
  desktop: "/videos/captacao/imoveis-640.mp4",
  celular: "/videos/captacao/imoveis-432.mp4",
};

export function PainelMarca({ aoCadastrar, className }: PainelMarcaProps) {
  const reduzido = useReducedMotion();
  const larga = useTelaLarga();
  const video = larga ? REEL.desktop : REEL.celular;
  return (
    <section
      aria-labelledby="titulo-captacao"
      className={cn(
        "relative isolate flex min-h-0 flex-col overflow-hidden rounded-3xl bg-secondary text-secondary-foreground shadow-xl",
        className,
      )}
    >
      {reduzido ? (
        <img src={REEL.poster} alt="" aria-hidden="true" className="absolute inset-0 -z-10 h-full w-full object-cover" />
      ) : (
        <video
          key={video}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={REEL.poster}
          aria-hidden="true"
          tabIndex={-1}
          className="absolute inset-0 -z-10 h-full w-full object-cover"
        >
          <source src={video} type="video/mp4" />
        </video>
      )}
      {/* O vídeo é o protagonista: tinta leve no todo e faixas escuras só onde há texto (topo e base). */}
      <div className="absolute inset-0 -z-10 bg-secondary/20" aria-hidden="true" />
      <div className="absolute inset-x-0 top-0 -z-10 h-[62%] bg-gradient-to-b from-secondary/85 via-secondary/45 to-transparent" aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-[46%] bg-gradient-to-t from-secondary/90 via-secondary/50 to-transparent" aria-hidden="true" />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-7 xl:p-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <motion.div
          initial={reduzido ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="shrink-0"
        >
          <p className="inline-flex items-center gap-2 rounded-full bg-background/10 px-3 py-1 text-[11px] font-medium ring-1 ring-secondary-foreground/15 backdrop-blur-sm sm:text-xs">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Gestão de temporada em Cabo Frio e região
          </p>
          <h1
            id="titulo-captacao"
            className="mt-3 text-[clamp(1.55rem,2.6vw+0.6rem,2.9rem)] font-bold leading-[1.05] tracking-tight [text-shadow:0_2px_16px_hsl(var(--secondary)/0.95)]"
          >
            Seu imóvel rendendo até 40% mais.
          </h1>
          <p className="mt-2 max-w-lg text-[clamp(0.9rem,0.45vw+0.7rem,1.075rem)] leading-snug text-secondary-foreground/90 [text-shadow:0_1px_10px_hsl(var(--secondary)/0.95)] sm:leading-relaxed">
            Uma comissão só, com tudo dentro. Você não precisa se envolver com nada.
          </p>
          <p className="mt-2 text-[11px] text-secondary-foreground/70 sm:hidden">
            Anunciado no Airbnb, Booking, Expedia e Google
          </p>
          <ul className="mt-3 hidden flex-wrap items-center gap-1.5 sm:flex" aria-label="Onde o imóvel é anunciado">
            <li className="text-[11px] text-secondary-foreground/60">Anunciado em</li>
            {PLATAFORMAS.map((p) => (
              <li key={p} className="rounded-full bg-background/10 px-2 py-0.5 text-[11px] font-semibold ring-1 ring-secondary-foreground/15">
                {p}
              </li>
            ))}
          </ul>
        </motion.div>

        <div className="flex flex-1 items-center py-3 sm:py-5">
          <Vitrine />
        </div>

        <div className="shrink-0">
          <Numeros />
          <p className="mt-2.5 text-[11px] text-secondary-foreground/70 sm:mt-3 sm:text-xs">
            {CIDADES.map((c, i) => (
              <span key={c.nome}>
                {i > 0 && <span aria-hidden="true"> · </span>}
                {c.nome} <span className="font-semibold text-secondary-foreground">{c.comissao}</span>
              </span>
            ))}
            <span aria-hidden="true"> · </span>
            sem taxa de setup
          </p>

          {aoCadastrar && (
            <Button size="lg" onClick={aoCadastrar} className="mt-3 h-12 w-full gap-2 text-base shadow-lg">
              Cadastrar meu imóvel
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs sm:mt-4 sm:text-sm">
            <LinkExterno href={LINKS.simulador} className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline">
              Simular a receita do meu imóvel
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </LinkExterno>
            <LinkExterno
              href={LINKS.comoTrabalhamos}
              className="hidden items-center gap-1 font-medium text-secondary-foreground/80 underline-offset-4 hover:underline sm:inline-flex"
            >
              Como a RIOS trabalha
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </LinkExterno>
          </div>
          {!aoCadastrar && <ContatoCaptacao escuro className="mt-3 border-t border-secondary-foreground/10 pt-3" />}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Vitrine: o que está incluso e os resultados, um por vez                   */
/* ------------------------------------------------------------------------ */

type Slide =
  | { tipo: "diferencial"; icone: LucideIcon; titulo: string; texto: string }
  | { tipo: "resultado"; titulo: string; texto: string; ganho: string };

/** Três diferenciais, um resultado, e assim por diante: o ritmo evita a sensação de lista. */
function montarSlides(): Slide[] {
  const slides: Slide[] = [];
  const resultados = RESULTADOS.map<Slide>((r) => ({
    tipo: "resultado",
    titulo: `${r.imovel} em ${r.bairro}`,
    texto: `De ${r.antes} para ${r.depois} por mês, com ${r.ocupacao} de ocupação.`,
    ganho: r.ganho,
  }));
  INCLUSOS.forEach((d, i) => {
    slides.push({ tipo: "diferencial", ...d });
    if ((i + 1) % 3 === 0 && resultados.length) slides.push(resultados.shift()!);
  });
  slides.push(...resultados);
  return slides;
}

const SLIDES = montarSlides();
/** Tempo de cada item. Em 4,5 s parecia parado; 3 s mantém o olho. */
const DURACAO_MS = 3000;

function Vitrine() {
  const reduzido = useReducedMotion();
  const [indice, setIndice] = useState(0);
  const [pausadoPeloUsuario, setPausadoPeloUsuario] = useState(false);
  const [sobreposto, setSobreposto] = useState(false);
  const pausado = pausadoPeloUsuario || sobreposto;
  const restanteRef = useRef(DURACAO_MS);
  const inicioRef = useRef(0);
  const slide = SLIDES[indice];

  // A cada item novo o relógio recomeça (este efeito vem antes do relógio).
  useEffect(() => {
    restanteRef.current = DURACAO_MS;
  }, [indice]);

  // Relógio que avança sozinho. Pausar guarda o tempo que faltava, para a
  // barra de progresso (CSS) e a troca continuarem juntas.
  useEffect(() => {
    if (reduzido || pausado) return;
    inicioRef.current = Date.now();
    const t = setTimeout(() => setIndice((v) => (v + 1) % SLIDES.length), restanteRef.current);
    return () => {
      clearTimeout(t);
      restanteRef.current = Math.max(250, restanteRef.current - (Date.now() - inicioRef.current));
    };
  }, [indice, pausado, reduzido]);

  const ir = (i: number) => setIndice(((i % SLIDES.length) + SLIDES.length) % SLIDES.length);

  return (
    <div
      role="region"
      aria-roledescription="carrossel"
      aria-label="O que está incluso na comissão e resultados"
      onMouseEnter={() => setSobreposto(true)}
      onMouseLeave={() => setSobreposto(false)}
      onFocus={() => setSobreposto(true)}
      onBlur={() => setSobreposto(false)}
      className="w-full rounded-2xl bg-secondary/60 p-3.5 ring-1 ring-secondary-foreground/15 backdrop-blur-md sm:p-5"
    >
      <div className="relative min-h-[5.25rem] sm:min-h-[6.5rem]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={indice}
            initial={reduzido ? false : { opacity: 0, y: 10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduzido ? undefined : { opacity: 0, y: -10, scale: 0.985 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            className="flex items-start gap-3.5 sm:gap-4"
            aria-live="polite"
          >
            {slide.tipo === "diferencial" ? (
              <motion.span
                initial={reduzido ? false : { scale: 0.6, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 22 }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--rios-blue-light))]/25 text-secondary-foreground ring-1 ring-secondary-foreground/15 sm:h-12 sm:w-12"
              >
                <slide.icone className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
              </motion.span>
            ) : (
              <motion.span
                initial={reduzido ? false : { scale: 0.6 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 22 }}
                className="flex h-10 shrink-0 items-center justify-center gap-1 rounded-xl bg-success/25 px-2.5 text-sm font-bold text-secondary-foreground ring-1 ring-success/40 sm:h-12 sm:px-3"
              >
                <TrendingUp className="h-4 w-4" aria-hidden="true" />
                {slide.ganho}
              </motion.span>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-secondary-foreground/60 sm:text-[11px]">
                {slide.tipo === "diferencial" ? "Incluso na comissão" : "Resultado de um imóvel RIOS"}
              </p>
              <h2 className="mt-0.5 text-[15px] font-semibold leading-tight sm:text-lg xl:text-xl">{slide.titulo}</h2>
              <p className="mt-1 text-xs leading-snug text-secondary-foreground/80 sm:text-sm sm:leading-relaxed">{slide.texto}</p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-2.5 flex items-center gap-3 sm:mt-4">
        <div role="tablist" aria-label="Itens da vitrine" className="flex flex-1 gap-1">
          {SLIDES.map((s, k) => (
            <button
              key={s.titulo}
              type="button"
              role="tab"
              aria-selected={k === indice}
              aria-label={`${k + 1} de ${SLIDES.length}: ${s.titulo}`}
              onClick={() => ir(k)}
              className="h-3 flex-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="block h-1 w-full overflow-hidden rounded-full bg-secondary-foreground/25">
                {k < indice && <span className="block h-full w-full bg-secondary-foreground" />}
                {k === indice && (
                  <span
                    key={`${indice}-${reduzido ? "r" : "a"}`}
                    className={cn(
                      "block h-full w-full origin-left bg-secondary-foreground",
                      reduzido ? "" : "animate-[vitrine-progresso_var(--vitrine-duracao)_linear_forwards]",
                    )}
                    style={{
                      ["--vitrine-duracao" as string]: `${DURACAO_MS}ms`,
                      animationPlayState: pausado ? "paused" : "running",
                    }}
                  />
                )}
              </span>
            </button>
          ))}
        </div>
        {!reduzido && (
          <button
            type="button"
            onClick={() => setPausadoPeloUsuario((v) => !v)}
            aria-pressed={pausadoPeloUsuario}
            aria-label={pausadoPeloUsuario ? "Retomar a vitrine" : "Pausar a vitrine"}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background/10 text-secondary-foreground/80 ring-1 ring-secondary-foreground/15 transition hover:bg-background/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {pausadoPeloUsuario ? <Play className="h-3 w-3" aria-hidden="true" /> : <Pause className="h-3 w-3" aria-hidden="true" />}
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Números que contam ao aparecer                                            */
/* ------------------------------------------------------------------------ */

function useContagem(alvo: number, ativo: boolean, duracaoMs = 900) {
  const reduzido = useReducedMotion();
  const [valor, setValor] = useState(reduzido ? alvo : 0);
  useEffect(() => {
    if (!ativo) return;
    if (reduzido) {
      setValor(alvo);
      return;
    }
    let raf = 0;
    const inicio = performance.now();
    const passo = (agora: number) => {
      const p = Math.min(1, (agora - inicio) / duracaoMs);
      const suave = 1 - Math.pow(1 - p, 3);
      setValor(Math.round(alvo * suave));
      if (p < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [alvo, ativo, duracaoMs, reduzido]);
  return valor;
}

function Numero({ valor, prefixo, rotulo, ativo, atraso }: { valor: number; prefixo?: string; rotulo: string; ativo: boolean; atraso: number }) {
  const [comecou, setComecou] = useState(false);
  useEffect(() => {
    if (!ativo) return;
    const t = setTimeout(() => setComecou(true), atraso);
    return () => clearTimeout(t);
  }, [ativo, atraso]);
  const atual = useContagem(valor, comecou);
  return (
    <div>
      <p className="text-xl font-bold tabular-nums tracking-tight [text-shadow:0_1px_10px_hsl(var(--secondary)/0.95)] sm:text-2xl xl:text-3xl">
        {prefixo}
        {atual.toLocaleString("pt-BR")}
      </p>
      <p className="mt-0.5 text-[10px] leading-snug text-secondary-foreground/70 sm:text-xs">{rotulo}</p>
    </div>
  );
}

function Numeros() {
  const ref = useRef<HTMLDListElement>(null);
  const naTela = useInView(ref, { once: true, margin: "-20px" });
  return (
    <dl ref={ref} className="grid grid-cols-4 gap-2 border-t border-secondary-foreground/15 pt-3 sm:gap-3 sm:pt-4">
      {NUMEROS.map((n, i) => (
        <div key={n.rotulo}>
          <Numero {...n} ativo={naTela} atraso={i * 90} />
        </div>
      ))}
    </dl>
  );
}
