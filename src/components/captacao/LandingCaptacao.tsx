// Peças da mini landing de captação (/cadastro-imovel): a página pública que
// recebe quem vem dos anúncios. O conteúdo espelha o site (conteudo.ts); o
// formulário em si fica na página.
import { ReactNode, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ArrowUpRight, ExternalLink, Instagram, Mail, MapPin, Sparkles, TrendingUp } from "lucide-react";
import riosLogo from "@/assets/rios-logo.png";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { CIDADES, INCLUSOS, LINKS, NUMEROS, PASSOS, PERGUNTAS, RESULTADOS } from "./conteudo";

export const ID_FORMULARIO = "cadastro";

/** Rola até o formulário; com "reduzir movimento" ligado, pula direto. */
export function irAoFormulario(reduzido: boolean | null) {
  document.getElementById(ID_FORMULARIO)?.scrollIntoView({ behavior: reduzido ? "auto" : "smooth", block: "start" });
}

function LinkExterno({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

/** Bloco que entra suave ao rolar; parado quando o sistema pede menos movimento. */
function Secao({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
  const reduzido = useReducedMotion();
  return (
    <motion.section
      id={id}
      initial={reduzido ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className={cn("scroll-mt-20", className)}
    >
      {children}
    </motion.section>
  );
}

function TituloSecao({ etiqueta, titulo, texto }: { etiqueta: string; titulo: string; texto?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--rios-blue))]">{etiqueta}</p>
      <h2 className="mt-2 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{titulo}</h2>
      {texto && <p className="mt-3 text-base leading-relaxed text-muted-foreground">{texto}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Cabeçalho fixo                                                            */
/* ------------------------------------------------------------------------ */

const ANCORAS = [
  { href: "#como-funciona", rotulo: "Como funciona" },
  { href: "#inclusos", rotulo: "O que inclui" },
  { href: "#resultados", rotulo: "Resultados" },
  { href: "#duvidas", rotulo: "Dúvidas" },
];

export function CabecalhoCaptacao() {
  const reduzido = useReducedMotion();
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[hsl(var(--rios-blue))] via-[hsl(var(--rios-blue-light))] to-[hsl(var(--rios-terra))]" />
      <div className="container mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <LinkExterno href={LINKS.site} className="flex items-center gap-3">
          <img src={riosLogo} alt="RIOS Hospedagens" className="h-8 w-auto object-contain sm:h-9" />
          <span className="hidden text-[11px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--rios-blue))] sm:inline">
            Hospedagens
          </span>
        </LinkExterno>

        <nav aria-label="Seções da página" className="hidden items-center gap-6 md:flex">
          {ANCORAS.map((a) => (
            <a key={a.href} href={a.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {a.rotulo}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden gap-1.5 sm:inline-flex">
            <LinkExterno href={LINKS.site}>
              Conhecer a RIOS
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </LinkExterno>
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => irAoFormulario(reduzido)}>
            Cadastrar imóvel
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------------ */
/* Abertura                                                                  */
/* ------------------------------------------------------------------------ */

export function HeroCaptacao() {
  const reduzido = useReducedMotion();
  return (
    <section className="relative isolate overflow-hidden bg-secondary text-secondary-foreground">
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
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-secondary/95 via-secondary/80 to-secondary/40" aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-24 bg-gradient-to-t from-secondary to-transparent" aria-hidden="true" />

      <div className="container mx-auto max-w-6xl px-4 pb-28 pt-14 sm:pt-20 lg:pb-36 lg:pt-24">
        <motion.div
          initial={reduzido ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl"
        >
          <p className="inline-flex items-center gap-2 rounded-full bg-background/10 px-3 py-1 text-xs font-medium ring-1 ring-secondary-foreground/15 backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Gestão de temporada em Cabo Frio e região
          </p>
          <h1 className="mt-5 text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl">
            Seu imóvel rendendo até 40% mais, sem você precisar se envolver.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-secondary-foreground/80 sm:text-lg">
            Uma comissão só, com tudo dentro: decoração, fotos profissionais, precificação dinâmica, operação local e
            aplicativo próprio. Anunciado no Airbnb, Booking, Expedia e Google. Sem taxas extras.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button size="lg" className="h-12 gap-2 px-6 text-base shadow-lg" onClick={() => irAoFormulario(reduzido)}>
              Cadastrar meu imóvel
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 gap-2 border-secondary-foreground/30 bg-background/10 px-6 text-base text-secondary-foreground backdrop-blur-sm hover:bg-background/20 hover:text-secondary-foreground"
            >
              <LinkExterno href={LINKS.site}>
                Conhecer a RIOS
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </LinkExterno>
            </Button>
          </div>
          <p className="mt-4 text-sm text-secondary-foreground/70">
            Diagnóstico gratuito e sem compromisso.{" "}
            <LinkExterno href={LINKS.simulador} className="underline underline-offset-4 hover:text-secondary-foreground">
              Simule a receita do seu imóvel no site
            </LinkExterno>
            .
          </p>
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Números                                                                   */
/* ------------------------------------------------------------------------ */

export function NumerosRios() {
  return (
    <Secao className="container mx-auto -mt-16 max-w-6xl px-4 lg:-mt-20">
      <dl className="grid grid-cols-2 gap-3 rounded-3xl border border-border/60 bg-background/90 p-4 shadow-xl backdrop-blur-xl sm:gap-4 sm:p-6 lg:grid-cols-4">
        {NUMEROS.map((n) => (
          <div key={n.rotulo} className="rounded-2xl bg-muted/40 px-4 py-4 text-center sm:py-5">
            <dd className="text-3xl font-bold tracking-tight text-[hsl(var(--rios-blue))] sm:text-4xl">{n.valor}</dd>
            <dt className="mt-1 text-xs leading-snug text-muted-foreground sm:text-sm">{n.rotulo}</dt>
          </div>
        ))}
      </dl>
    </Secao>
  );
}

/* ------------------------------------------------------------------------ */
/* Como funciona                                                             */
/* ------------------------------------------------------------------------ */

export function ComoFunciona() {
  return (
    <Secao id="como-funciona" className="container mx-auto max-w-6xl px-4 py-16 sm:py-20">
      <TituloSecao
        etiqueta="Como funciona"
        titulo="Três passos, custo zero para começar"
        texto="Sem taxa de setup e sem mensalidade. A comissão só existe quando a reserva acontece."
      />
      <ol className="relative mt-10 grid gap-6 md:grid-cols-3">
        <div aria-hidden="true" className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block" />
        {PASSOS.map((p, i) => (
          <li key={p.titulo} className="relative rounded-2xl border border-border/60 bg-background p-6 shadow-sm">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground shadow-md">
              {i + 1}
            </span>
            <h3 className="mt-4 text-lg font-semibold leading-tight">{p.titulo}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.texto}</p>
          </li>
        ))}
      </ol>
    </Secao>
  );
}

/* ------------------------------------------------------------------------ */
/* O que está incluso                                                        */
/* ------------------------------------------------------------------------ */

export function InclusosNaComissao() {
  return (
    <Secao id="inclusos" className="bg-muted/40 py-16 sm:py-20">
      <div className="container mx-auto max-w-6xl px-4">
        <TituloSecao
          etiqueta="O que está incluso"
          titulo="Tudo dentro da comissão"
          texto="Enquanto outros improvisam pelo WhatsApp, a RIOS tem equipe própria, 11 anos de dados e aplicativo desenvolvido em casa."
        />
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {INCLUSOS.map((item) => {
            const Icone = item.icone;
            return (
              <li key={item.titulo} className="group rounded-2xl border border-border/60 bg-background p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0">
                <span className="inline-flex rounded-xl bg-[hsl(var(--rios-blue))]/10 p-2.5 text-[hsl(var(--rios-blue))]">
                  <Icone className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-semibold leading-tight">{item.titulo}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.texto}</p>
              </li>
            );
          })}
        </ul>
        <div className="mt-8 text-center">
          <Button asChild variant="link" className="gap-1 text-[hsl(var(--rios-blue))]">
            <LinkExterno href={LINKS.comoTrabalhamos}>
              Ver em detalhe como trabalhamos
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </LinkExterno>
          </Button>
        </div>
      </div>
    </Secao>
  );
}

/* ------------------------------------------------------------------------ */
/* Resultados                                                                */
/* ------------------------------------------------------------------------ */

export function ResultadosReais() {
  return (
    <Secao id="resultados" className="container mx-auto max-w-6xl px-4 py-16 sm:py-20">
      <TituloSecao
        etiqueta="Resultados"
        titulo="Imóveis da carteira, antes e depois da RIOS"
        texto="Receita mensal média de imóveis em Cabo Frio, publicada no nosso site."
      />
      <ul className="mt-10 grid gap-4 md:grid-cols-3">
        {RESULTADOS.map((r) => (
          <li key={`${r.imovel}-${r.bairro}`} className="rounded-2xl border border-border/60 bg-background p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold leading-tight">{r.imovel}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" aria-hidden="true" />
                  {r.bairro}, Cabo Frio
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-bold text-success">
                <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                {r.ganho}
              </span>
            </div>
            <div className="mt-5 flex items-end gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Antes</p>
                <p className="text-base font-medium text-muted-foreground line-through decoration-muted-foreground/50">{r.antes}</p>
              </div>
              <ArrowRight className="mb-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Com a RIOS</p>
                <p className="text-2xl font-bold tracking-tight text-[hsl(var(--rios-blue))]">
                  {r.depois}
                  <span className="text-sm font-medium text-muted-foreground">/mês</span>
                </p>
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Ocupação de {r.ocupacao}</p>
          </li>
        ))}
      </ul>
      <div className="mt-8 text-center">
        <Button asChild variant="link" className="gap-1 text-[hsl(var(--rios-blue))]">
          <LinkExterno href={LINKS.portfolio}>
            Conhecer os imóveis RIOS
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </LinkExterno>
        </Button>
      </div>
    </Secao>
  );
}

/* ------------------------------------------------------------------------ */
/* Onde atuamos                                                              */
/* ------------------------------------------------------------------------ */

export function OndeAtuamos() {
  return (
    <Secao className="bg-muted/40 py-14 sm:py-16">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="grid items-center gap-8 lg:grid-cols-[1fr,1.2fr]">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--rios-blue))]">Onde atuamos</p>
            <h2 className="mt-2 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">Região dos Lagos, com equipe no local</h2>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Sede em Cabo Frio e operação própria em Búzios, Arraial do Cabo e Peró. A comissão já inclui tudo: sem taxa de
              setup, sem mensalidade, sem surpresa.
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-3">
            {CIDADES.map((c) => (
              <li
                key={c.nome}
                className={cn(
                  "rounded-2xl border p-4 shadow-sm",
                  c.sede ? "border-[hsl(var(--rios-blue))]/30 bg-[hsl(var(--rios-blue))]/5" : "border-border/60 bg-background",
                )}
              >
                <p className="flex items-center gap-1.5 font-semibold">
                  <MapPin className="h-4 w-4 text-[hsl(var(--rios-blue))]" aria-hidden="true" />
                  {c.nome}
                  {c.sede && <span className="ml-1 rounded-full bg-[hsl(var(--rios-blue))]/10 px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--rios-blue))]">Sede</span>}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Comissão de <span className="font-semibold text-foreground">{c.comissao}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Secao>
  );
}

/* ------------------------------------------------------------------------ */
/* Dúvidas                                                                   */
/* ------------------------------------------------------------------------ */

export function PerguntasCaptacao() {
  return (
    <Secao id="duvidas" className="container mx-auto max-w-3xl px-4 py-16 sm:py-20">
      <TituloSecao etiqueta="Dúvidas frequentes" titulo="O que os proprietários mais perguntam" />
      <Accordion type="single" collapsible className="mt-8 rounded-2xl border border-border/60 bg-background px-5 shadow-sm">
        {PERGUNTAS.map((p, i) => (
          <AccordionItem key={p.pergunta} value={`p-${i}`} className={i === PERGUNTAS.length - 1 ? "border-b-0" : undefined}>
            <AccordionTrigger className="text-left text-base font-semibold hover:no-underline">{p.pergunta}</AccordionTrigger>
            <AccordionContent className="text-sm leading-relaxed text-muted-foreground">{p.resposta}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <div className="mt-6 text-center">
        <Button asChild variant="link" className="gap-1 text-[hsl(var(--rios-blue))]">
          <LinkExterno href={LINKS.faq}>
            Ver todas as perguntas no site
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </LinkExterno>
        </Button>
      </div>
    </Secao>
  );
}

/* ------------------------------------------------------------------------ */
/* Rodapé                                                                    */
/* ------------------------------------------------------------------------ */

const LINKS_RODAPE = [
  { href: LINKS.comoTrabalhamos, rotulo: "Como trabalhamos" },
  { href: LINKS.clube, rotulo: "Owners Club" },
  { href: LINKS.app, rotulo: "Aplicativo RIOS" },
  { href: LINKS.portfolio, rotulo: "Imóveis RIOS" },
  { href: LINKS.planos, rotulo: "Planos" },
  { href: LINKS.guia, rotulo: "Guia turístico" },
];

export function RodapeCaptacao() {
  return (
    <footer className="border-t border-border/60 bg-secondary text-secondary-foreground">
      <div className="container mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-10 md:grid-cols-[1.3fr,1fr,1fr]">
          <div>
            <img src={riosLogo} alt="RIOS Hospedagens" className="h-9 w-auto object-contain brightness-0 invert" />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-secondary-foreground/75">
              Gestão de aluguel por temporada desde 2015, fundada por Paulo e Thais Rios a partir do próprio apartamento.
            </p>
            <p className="mt-3 flex items-center gap-1.5 text-sm text-secondary-foreground/75">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              Cabo Frio – RJ · Região dos Lagos
            </p>
            <Button asChild size="lg" variant="outline" className="mt-6 gap-2 border-secondary-foreground/30 bg-transparent text-secondary-foreground hover:bg-background/10 hover:text-secondary-foreground">
              <LinkExterno href={LINKS.site}>
                Conhecer a RIOS no site
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </LinkExterno>
            </Button>
          </div>

          <nav aria-label="Páginas do site da RIOS">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary-foreground/60">No site</p>
            <ul className="mt-3 space-y-2">
              {LINKS_RODAPE.map((l) => (
                <li key={l.href}>
                  <LinkExterno href={l.href} className="text-sm text-secondary-foreground/80 transition-colors hover:text-secondary-foreground">
                    {l.rotulo}
                  </LinkExterno>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary-foreground/60">Fale com a gente</p>
            <ul className="mt-3 space-y-2">
              <li>
                <a href={`mailto:${LINKS.email}`} className="inline-flex items-center gap-2 text-sm text-secondary-foreground/80 transition-colors hover:text-secondary-foreground">
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  {LINKS.email}
                </a>
              </li>
              <li>
                <LinkExterno href={LINKS.instagram} className="inline-flex items-center gap-2 text-sm text-secondary-foreground/80 transition-colors hover:text-secondary-foreground">
                  <Instagram className="h-4 w-4" aria-hidden="true" />
                  @rioshospedagens
                </LinkExterno>
              </li>
              <li>
                <LinkExterno href={LINKS.contato} className="inline-flex items-center gap-2 text-sm text-secondary-foreground/80 transition-colors hover:text-secondary-foreground">
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  Formulário de contato
                </LinkExterno>
              </li>
            </ul>
          </div>
        </div>
        <p className="mt-10 border-t border-secondary-foreground/15 pt-6 text-xs text-secondary-foreground/60">
          © {new Date().getFullYear()} RIOS Hospedagens. Portal do proprietário.
        </p>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------------ */
/* Barra de ação no celular                                                  */
/* ------------------------------------------------------------------------ */

/** true enquanto o elemento com o id está na tela. */
function useNaTela(id: string) {
  const [naTela, setNaTela] = useState(true);
  useEffect(() => {
    const alvo = document.getElementById(id);
    if (!alvo || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(([e]) => setNaTela(e.isIntersecting), { rootMargin: "0px 0px -40% 0px" });
    obs.observe(alvo);
    return () => obs.disconnect();
  }, [id]);
  return naTela;
}

/** Botão fixo no rodapé do celular; some quando a abertura ou o formulário estão na tela. */
export function BarraCtaMovel({ idAbertura }: { idAbertura: string }) {
  const reduzido = useReducedMotion();
  const aberturaNaTela = useNaTela(idAbertura);
  const formularioNaTela = useNaTela(ID_FORMULARIO);
  const montadoRef = useRef(false);
  useEffect(() => {
    montadoRef.current = true;
  }, []);
  const visivel = montadoRef.current && !aberturaNaTela && !formularioNaTela;

  return (
    <div
      aria-hidden={!visivel}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/90 p-3 backdrop-blur-md transition-transform duration-300 md:hidden",
        "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        visivel ? "translate-y-0" : "translate-y-full",
      )}
    >
      <Button size="lg" className="h-12 w-full gap-2 text-base shadow-lg" tabIndex={visivel ? 0 : -1} onClick={() => irAoFormulario(reduzido)}>
        Cadastrar meu imóvel
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
