import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { TOM, type Tom } from "./tons";

/* ------------------------------------------------------------------------ */
/* Caixa                                                                     */
/* ------------------------------------------------------------------------ */

interface CaixaProps {
  id?: string;
  icone: ReactNode;
  titulo: string;
  tom?: Tom;
  /** Contadores e selos ao lado do título. */
  selos?: ReactNode;
  /** Botões à direita do cabeçalho. */
  acoes?: ReactNode;
  /** Linha extra abaixo do cabeçalho (dica, seleção em massa...). */
  subcabecalho?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Sem padding interno: o conteúdo cuida do próprio espaçamento. */
  semPadding?: boolean;
}

/**
 * Cartão padrão das caixas do painel (Manutenções, Cobranças, Chamados...).
 *
 * Cabeçalho com ícone em caixa tingida, título, selos e ações; corpo com
 * padding uniforme. Todas as caixas das duas páginas usam este casco para
 * ficarem iguais entre si.
 */
export function CaixaOperacao({
  id,
  icone,
  titulo,
  tom = "neutral",
  selos,
  acoes,
  subcabecalho,
  children,
  className,
  semPadding = false,
}: CaixaProps) {
  return (
    <Card id={id} className={cn("w-full min-w-0 overflow-hidden rounded-xl border-border/70", className)}>
      <div className="border-b border-border/60 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg [&>svg]:h-4 [&>svg]:w-4", TOM[tom].caixa)}
              aria-hidden="true"
            >
              {icone}
            </span>
            <h3 className="text-sm font-semibold leading-none tracking-tight md:text-[15px]">{titulo}</h3>
            {selos}
          </div>
          {acoes && <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">{acoes}</div>}
        </div>
        {subcabecalho && <div className="mt-2">{subcabecalho}</div>}
      </div>
      <div className={cn(!semPadding && "px-3 py-3")}>{children}</div>
    </Card>
  );
}

/* ------------------------------------------------------------------------ */
/* Selo de contagem                                                          */
/* ------------------------------------------------------------------------ */

export function SeloContagem({
  children,
  tom = "neutral",
  title,
  className,
}: {
  children: ReactNode;
  tom?: Tom;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold tabular-nums",
        tom === "neutral" ? "bg-muted text-foreground/80" : TOM[tom].caixa,
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------------ */
/* Grupo dentro da caixa                                                     */
/* ------------------------------------------------------------------------ */

interface GrupoProps {
  titulo: string;
  quantidade?: number;
  tom?: Tom;
  /** Botão à direita do rótulo (expandir, recolher...). */
  acao?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Rótulo de grupo (Vencidas, Pendentes, Novos...) com ponto colorido e contagem. */
export function GrupoCaixa({ titulo, quantidade, tom = "neutral", acao, children, className }: GrupoProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span className={cn("h-1.5 w-1.5 rounded-full", TOM[tom].ponto)} aria-hidden="true" />
          <span className={TOM[tom].texto}>{titulo}</span>
          {quantidade != null && <span className="tabular-nums text-muted-foreground/80">{quantidade}</span>}
        </p>
        {acao}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Linha                                                                     */
/* ------------------------------------------------------------------------ */

interface LinhaProps {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  /** Texto à direita, antes das ações (valor, data...). */
  meta?: ReactNode;
  /** Botões da linha. Cada um deve parar a propagação do clique. */
  acoes?: ReactNode;
  /** Miniatura à esquerda (foto do imóvel). */
  miniatura?: ReactNode;
  onClick?: () => void;
  tom?: Tom;
  /** Fundo tingido com o tom (vencida, problema, agendado...). */
  tingida?: boolean;
  semSeta?: boolean;
  className?: string;
}

/** Linha clicável dentro de uma caixa: título, subtítulo, meta, ações e seta. */
export function LinhaCaixa({
  titulo,
  subtitulo,
  meta,
  acoes,
  miniatura,
  onClick,
  tom = "neutral",
  tingida = false,
  semSeta = false,
  className,
}: LinhaProps) {
  const fundo = tingida && tom !== "neutral" ? cn(TOM[tom].fundo, "hover:bg-muted/70") : "bg-muted/40 hover:bg-muted/80";
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "flex min-w-0 items-center gap-2.5 overflow-hidden rounded-lg px-2.5 py-2 transition-colors",
        onClick && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        fundo,
        className,
      )}
    >
      {miniatura}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium leading-tight">{titulo}</p>
        {subtitulo && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitulo}</p>}
      </div>
      {meta && <div className="shrink-0 text-right text-xs">{meta}</div>}
      {acoes && (
        <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          {acoes}
        </div>
      )}
      {onClick && !semSeta && (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
      )}
    </div>
  );
}

/** Miniatura quadrada de imóvel para usar em `LinhaCaixa`. */
export function MiniaturaImovel({
  url,
  alt,
  fallback,
  tamanho = "h-9 w-9",
}: {
  url?: string | null;
  alt?: string;
  fallback: ReactNode;
  tamanho?: string;
}) {
  return (
    <div className={cn("shrink-0 overflow-hidden rounded-md bg-muted", tamanho)}>
      {url ? (
        <img src={url} alt={alt ?? ""} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">
          {fallback}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Estados                                                                   */
/* ------------------------------------------------------------------------ */

/** Vazio compacto para dentro de uma caixa. */
export function CaixaVazia({ icone, titulo, descricao }: { icone: ReactNode; titulo: string; descricao?: string }) {
  return (
    <EmptyState
      icon={icone}
      title={titulo}
      description={descricao}
      className="py-6 [&>div:first-child]:h-10 [&>div:first-child]:w-10 [&>h3]:text-sm [&>p]:text-xs"
    />
  );
}

/** Esqueleto de uma caixa inteira, com o mesmo cabeçalho do estado carregado. */
export function CaixaCarregando({
  icone,
  titulo,
  tom = "neutral",
  linhas = 3,
  className,
}: {
  icone: ReactNode;
  titulo: string;
  tom?: Tom;
  linhas?: number;
  className?: string;
}) {
  return (
    <CaixaOperacao icone={icone} titulo={titulo} tom={tom} className={className}>
      <div className="space-y-1.5" aria-busy="true" aria-label={`Carregando ${titulo.toLowerCase()}`}>
        {Array.from({ length: linhas }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-lg" />
        ))}
      </div>
    </CaixaOperacao>
  );
}

/* ------------------------------------------------------------------------ */
/* Botões de linha                                                           */
/* ------------------------------------------------------------------------ */

interface BotaoLinhaProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  rotulo: string;
  /** Contador de não lidas no canto do botão. */
  naoLidas?: number;
  tom?: Tom;
  /** Mostra o texto ao lado do ícone em telas largas. */
  texto?: string;
}

/** Botão pequeno de ação numa linha da caixa (chat, anexo, agendar...). */
export function BotaoLinha({ rotulo, naoLidas = 0, tom = "neutral", texto, className, children, ...props }: BotaoLinhaProps) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      className={cn(
        "relative inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md text-muted-foreground transition-colors",
        "hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        "[&>svg]:h-3.5 [&>svg]:w-3.5",
        texto ? "px-1.5 sm:pr-2" : "w-7",
        tom !== "neutral" && cn(TOM[tom].texto, "hover:bg-background"),
        className,
      )}
      {...props}
    >
      {children}
      {texto && <span className="hidden text-[11px] font-medium sm:inline">{texto}</span>}
      {naoLidas > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold text-destructive-foreground">
          {naoLidas > 9 ? "9+" : naoLidas}
        </span>
      )}
    </button>
  );
}

/** Gatilho "+N" / "Recolher" para os grupos com Collapsible. */
export function BotaoExpandir({ aberto, restantes }: { aberto: boolean; restantes: number }) {
  return (
    <span className="inline-flex h-5 cursor-pointer items-center gap-0.5 rounded px-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
      {aberto ? (
        <>
          <ChevronUp className="h-3 w-3" aria-hidden="true" />
          Recolher
        </>
      ) : (
        <>
          <ChevronDown className="h-3 w-3" aria-hidden="true" />+{restantes}
        </>
      )}
    </span>
  );
}
