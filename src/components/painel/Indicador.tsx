import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { TOM, type Tom } from "./tons";

export interface IndicadorProps {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  icone: ReactNode;
  /** Cor do ícone e, quando `realcarValor`, do número. */
  tom?: Tom;
  /** Pinta o número com o tom (para chamar atenção a vencidas, urgentes...). */
  realcarValor?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * Número de resumo no topo do painel.
 *
 * Cartão branco com ícone em caixa tingida, número grande e uma linha de
 * detalhe. Quando tem `onClick`, vira botão e mostra uma seta no canto ao
 * passar o mouse.
 */
export function Indicador({
  rotulo,
  valor,
  detalhe,
  icone,
  tom = "neutral",
  realcarValor = false,
  onClick,
  className,
}: IndicadorProps) {
  const Tag = onClick ? "button" : "div";
  const t = TOM[tom];
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "group relative flex min-w-0 flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 text-left shadow-sm",
        onClick &&
          "transition-all hover:-translate-y-0.5 hover:border-border hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", t.caixa)} aria-hidden="true">
          {icone}
        </span>
        {onClick && (
          <ArrowUpRight
            className="h-4 w-4 text-muted-foreground/60 opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden="true"
          />
        )}
      </div>
      <div className="min-w-0">
        <p className={cn("text-2xl font-semibold leading-none tracking-tight tabular-nums md:text-[28px]", realcarValor && t.texto)}>
          {valor}
        </p>
        <p className="mt-1.5 truncate text-xs font-medium text-muted-foreground md:text-[13px]">{rotulo}</p>
        {detalhe && <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground/80">{detalhe}</p>}
      </div>
    </Tag>
  );
}

export function IndicadorSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4", className)}>
      <Skeleton className="h-9 w-9 rounded-lg" />
      <div className="space-y-2">
        <Skeleton className="h-7 w-16" />
        <Skeleton className="h-3 w-28" />
      </div>
    </div>
  );
}
