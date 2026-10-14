// Landing de captação (/cadastro-imovel): uma tela só. À esquerda o painel da
// marca, animado (vitrine que roda sozinha, números que contam); à direita o
// formulário, que fica fixo na tela. O conteúdo vem de conteudo.ts.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowUpRight, ExternalLink, Instagram, Mail, Pause, Play, Sparkles, TrendingUp, type LucideIcon } from "lucide-react";
import riosLogo from "@/assets/rios-logo.png";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CIDADES, INCLUSOS, LINKS, NUMEROS, RESULTADOS } from "./conteudo";

export const ID_FORMULARIO = "cadastro";

function LinkExterno({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

/* ------------------------------------------------------------------------ */
/* Cabeçalho e rodapé: uma linha cada                                        */
/* ------------------------------------------------------------------------ */

export function CabecalhoCaptacao() {
  return (
    <header className="relative">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[hsl(var(--rios-blue))] via-[hsl(var(--rios-blue-light))] to-[hsl(var(--rios-terra))]" />
      <div className="container mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <LinkExterno href={LINKS.site} className="flex items-center gap-3" aria-label="Site da RIOS Hospedagens">
          <img src={riosLogo} alt="RIOS Hospedagens" className="h-8 w-auto object-contain sm:h-9" />
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

export function RodapeCaptacao() {
  return (
    <footer className="border-t border-border/60">
      <div className="container mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs text-muted-foreground sm:flex-row">
        <p>© {new Date().getFullYear()} RIOS Hospedagens · Cabo Frio – RJ · Região dos Lagos</p>
        <nav aria-label="Contato" className="flex items-center gap-4">
          <LinkExterno href={LINKS.site} className="inline-flex items-center gap-1 transition-colors hover:text-foreground">
            rioshospedagens.com.br
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </LinkExterno>
          <LinkExterno href={LINKS.instagram} className="inline-flex items-center gap-1 transition-colors hover:text-foreground">
            <Instagram className="h-3.5 w-3.5" aria-hidden="true" />
            @rioshospedagens
          </LinkExterno>
          <a href={`mailto:${LINKS.email}`} className="inline-flex items-center gap-1 transition-colors hover:text-foreground">
            <Mail className="h-3.5 w-3.5" aria-hidden="true" />
            E-mail
          </a>
        </nav>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------------ */
/* Painel da marca                                                           */
/* ------------------------------------------------------------------------ */

export function PainelMarca() {
  const reduzido = useReducedMotion();
  return (
    <section
      aria-labelledby="titulo-captacao"
      className="relative isolate flex flex-col overflow-hidden rounded-3xl bg-secondary text-secondary-foreground shadow-xl lg:min-h-[calc(100dvh-8.5rem)]"
    >
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
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-secondary/95 via-secondary/85 to-secondary/55" aria-hidden="true" />

      <div className="flex flex-1 flex-col gap-5 p-6 sm:p-8 lg:justify-between lg:p-10">
        <motion.div
          initial={reduzido ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <p className="inline-flex items-center gap-2 rounded-full bg-background/10 px-3 py-1 text-xs font-medium ring-1 ring-secondary-foreground/15 backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Gestão de temporada em Cabo Frio e região
          </p>
          <h1 id="titulo-captacao" className="mt-4 text-3xl font-bold leading-[1.05] tracking-tight sm:text-4xl xl:text-5xl">
            Seu imóvel rendendo até 40% mais.
          </h1>
          <p className="mt-3 max-w-lg text-base leading-relaxed text-secondary-foreground/80 sm:text-lg">
            Uma comissão só, com tudo dentro. Sem taxa de setup, sem mensalidade e sem você precisar se envolver.
          </p>
          <a
            href={`#${ID_FORMULARIO}`}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold underline-offset-4 hover:underline lg:hidden"
          >
            Preencher o cadastro
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </a>
        </motion.div>

        <Vitrine />

        <div>
          <Numeros />
          <p className="mt-4 text-xs text-secondary-foreground/70">
            {CIDADES.map((c, i) => (
              <span key={c.nome}>
                {i > 0 && <span aria-hidden="true"> · </span>}
                {c.nome} <span className="font-semibold text-secondary-foreground">{c.comissao}</span>
              </span>
            ))}
            <span aria-hidden="true"> · </span>
            sem taxa de setup
          </p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <LinkExterno href={LINKS.simulador} className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline">
              Simular a receita do meu imóvel
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </LinkExterno>
            <LinkExterno href={LINKS.comoTrabalhamos} className="inline-flex items-center gap-1 font-medium text-secondary-foreground/80 underline-offset-4 hover:underline">
              Como a RIOS trabalha
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </LinkExterno>
          </div>
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
const DURACAO_MS = 4500;

function Vitrine() {
  const reduzido = useReducedMotion();
  const [indice, setIndice] = useState(0);
  const [pausadoPeloUsuario, setPausadoPeloUsuario] = useState(false);
  const [sobreposto, setSobreposto] = useState(false);
  const pausado = pausadoPeloUsuario || sobreposto;
  const restanteRef = useRef(DURACAO_MS);
  const inicioRef = useRef(0);
  const slide = SLIDES[indice];

  // A cada slide novo o relógio recomeça do zero (este efeito vem antes do
  // relógio, então vale para a mesma renderização).
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
      className="rounded-2xl bg-background/10 p-4 ring-1 ring-secondary-foreground/15 backdrop-blur-md sm:p-5"
    >
      <div className="relative min-h-[7rem]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={indice}
            initial={reduzido ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduzido ? undefined : { opacity: 0, y: -12 }}
            transition={{ duration: 0.32, ease: "easeOut" }}
            className="flex items-start gap-4"
            aria-live="polite"
          >
            {slide.tipo === "diferencial" ? (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--rios-blue-light))]/25 text-secondary-foreground ring-1 ring-secondary-foreground/15">
                <slide.icone className="h-6 w-6" aria-hidden="true" />
              </span>
            ) : (
              <span className="flex h-12 shrink-0 items-center justify-center gap-1 rounded-xl bg-success/25 px-3 text-sm font-bold text-secondary-foreground ring-1 ring-success/40">
                <TrendingUp className="h-4 w-4" aria-hidden="true" />
                {slide.ganho}
              </span>
            )}
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-secondary-foreground/60">
                {slide.tipo === "diferencial" ? "Incluso na comissão" : "Resultado de um imóvel RIOS"}
              </p>
              <h2 className="mt-1 text-lg font-semibold leading-tight sm:text-xl">{slide.titulo}</h2>
              <p className="mt-1 text-sm leading-relaxed text-secondary-foreground/80">{slide.texto}</p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-4 flex items-center gap-3">
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
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background/10 text-secondary-foreground/80 ring-1 ring-secondary-foreground/15 transition hover:bg-background/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {pausadoPeloUsuario ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : <Pause className="h-3.5 w-3.5" aria-hidden="true" />}
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Números que contam ao aparecer                                            */
/* ------------------------------------------------------------------------ */

function useContagem(alvo: number, ativo: boolean, duracaoMs = 1400) {
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
      <p className="text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
        {prefixo}
        {atual.toLocaleString("pt-BR")}
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-secondary-foreground/70 sm:text-xs">{rotulo}</p>
    </div>
  );
}

function Numeros() {
  const ref = useRef<HTMLDListElement>(null);
  const naTela = useInView(ref, { once: true, margin: "-40px" });
  return (
    <dl ref={ref} className="grid grid-cols-4 gap-3 border-t border-secondary-foreground/15 pt-5">
      {NUMEROS.map((n, i) => (
        <div key={n.rotulo}>
          <Numero {...n} ativo={naTela} atraso={i * 120} />
        </div>
      ))}
    </dl>
  );
}
