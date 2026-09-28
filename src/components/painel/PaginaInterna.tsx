import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { cn } from "@/lib/utils";
import { TOM, type Tom } from "./tons";

/* ------------------------------------------------------------------------ */
/* Cabeçalho                                                                 */
/* ------------------------------------------------------------------------ */

interface CabecalhoProps {
  titulo: string;
  subtitulo?: ReactNode;
  /** Ícone ao lado do título, em caixa tingida (mesma linguagem das caixas). */
  icone?: ReactNode;
  tom?: Tom;
  /**
   * Para onde "voltar" leva. Com destino, usa `replace: true` (regra nº 8:
   * voltar de lista não empilha histórico). Sem destino, volta uma página.
   */
  voltarPara?: string;
  /** Esconde o botão de voltar (páginas de primeiro nível). */
  semVoltar?: boolean;
  /** Botões à direita. */
  acoes?: ReactNode;
  /** Linha abaixo do título, ainda dentro da barra fixa: abas, filtros, busca. */
  abaixo?: ReactNode;
  className?: string;
}

/**
 * Barra fixa do topo das páginas internas (listas, detalhes e formulários).
 *
 * Mesma linguagem do `PainelHeader`: fundo translúcido, altura 56 px, ícone
 * tingido. À esquerda o voltar e o título; à direita as ações. A linha
 * `abaixo` serve para abas e filtros ficarem sempre à vista ao rolar.
 */
export function CabecalhoPagina({
  titulo,
  subtitulo,
  icone,
  tom = "primary",
  voltarPara,
  semVoltar = false,
  acoes,
  abaixo,
  className,
}: CabecalhoProps) {
  const navigate = useNavigate();
  const voltar = () => (voltarPara ? navigate(voltarPara, { replace: true }) : navigate(-1));

  return (
    <header
      className={cn(
        "safe-area-top sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md",
        className,
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2">
          {!semVoltar && (
            <Button
              variant="ghost"
              size="icon"
              onClick={voltar}
              aria-label="Voltar"
              className="-ml-2 h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          {icone && (
            <span
              className={cn(
                "hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:flex [&>svg]:h-4 [&>svg]:w-4",
                TOM[tom].caixa,
              )}
              aria-hidden="true"
            >
              {icone}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold leading-tight tracking-tight md:text-base">{titulo}</h1>
            {subtitulo && <p className="truncate text-xs text-muted-foreground">{subtitulo}</p>}
          </div>
        </div>
        {acoes && <div className="flex shrink-0 items-center gap-1.5">{acoes}</div>}
      </div>
      {abaixo && <div className="mx-auto w-full max-w-6xl px-4 pb-2.5">{abaixo}</div>}
    </header>
  );
}

/* ------------------------------------------------------------------------ */
/* Página                                                                    */
/* ------------------------------------------------------------------------ */

const LARGURA = {
  estreita: "max-w-2xl",
  media: "max-w-4xl",
  larga: "max-w-6xl",
} as const;

interface PaginaProps {
  cabecalho: ReactNode;
  children: ReactNode;
  /** estreita = formulários; media = detalhes; larga = listas. */
  largura?: keyof typeof LARGURA;
  /** Mostra a barra inferior do celular e reserva espaço para ela. */
  comNavInferior?: boolean;
  className?: string;
}

/** Casco das páginas internas: cabeçalho fixo, conteúdo centralizado, nav inferior. */
export function PaginaInterna({ cabecalho, children, largura = "larga", comNavInferior = false, className }: PaginaProps) {
  return (
    <div className="min-h-screen bg-background">
      {cabecalho}
      <main
        className={cn(
          "mx-auto w-full space-y-4 px-4 py-4 md:space-y-5 md:py-6",
          LARGURA[largura],
          comNavInferior ? "pb-28 md:pb-8" : "pb-10",
          className,
        )}
      >
        {children}
      </main>
      {comNavInferior && <MobileBottomNav />}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Barra de filtros                                                          */
/* ------------------------------------------------------------------------ */

/** Linha de filtros e busca com rolagem horizontal no celular. */
export function BarraFiltros({
  children,
  className,
  ...props
}: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}
      {...props}
    >
      {children}
    </div>
  );
}

/** Aba em forma de pílula para a linha `abaixo` do cabeçalho. */
export function AbaPilula({
  ativa,
  quantidade,
  tom = "neutral",
  children,
  ...props
}: {
  ativa: boolean;
  quantidade?: number;
  tom?: Tom;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={ativa}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        ativa
          ? "border-transparent bg-foreground text-background"
          : "border-border/70 bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      {...props}
    >
      {children}
      {quantidade != null && (
        <span
          className={cn(
            "inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums",
            ativa ? "bg-background/20 text-background" : tom === "neutral" ? "bg-muted text-foreground/70" : TOM[tom].caixa,
          )}
        >
          {quantidade}
        </span>
      )}
    </button>
  );
}
