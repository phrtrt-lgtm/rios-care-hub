import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Lista rótulo/valor para páginas de detalhe (imóvel, proprietário, datas...). */
export function ListaDefinicoes({ children, className, colunas = 1 }: { children: ReactNode; className?: string; colunas?: 1 | 2 }) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 text-sm",
        colunas === 2 ? "sm:grid-cols-2" : "",
        className,
      )}
    >
      {children}
    </dl>
  );
}

interface DefinicaoProps {
  rotulo: string;
  valor?: ReactNode;
  icone?: ReactNode;
  /** Deixa o valor em destaque (valor monetário, data-limite). */
  destaque?: boolean;
  className?: string;
}

export function Definicao({ rotulo, valor, icone, destaque = false, className }: DefinicaoProps) {
  return (
    <div className={cn("flex items-start gap-2.5 border-b border-border/50 py-2 last:border-0", className)}>
      {icone && (
        <span className="mt-0.5 shrink-0 text-muted-foreground [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">
          {icone}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</dt>
        <dd className={cn("mt-0.5 break-words", destaque ? "text-base font-semibold tabular-nums" : "text-sm")}>
          {valor ?? <span className="text-muted-foreground">—</span>}
        </dd>
      </div>
    </div>
  );
}
