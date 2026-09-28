import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TOM, type Tom } from "./tons";

interface Props {
  tom?: Tom;
  icone?: ReactNode;
  /** Ponto colorido antes do texto, em vez de ícone. */
  ponto?: boolean;
  /** Preenchida = fundo sólido no tom; padrão = fundo suave. */
  solida?: boolean;
  tamanho?: "sm" | "md";
  title?: string;
  className?: string;
  children: ReactNode;
}

const SOLIDA: Record<Tom, string> = {
  primary: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
  info: "bg-info text-info-foreground",
  destructive: "bg-destructive text-destructive-foreground",
  neutral: "bg-muted-foreground text-background",
};

/**
 * Etiqueta de status, prioridade ou categoria, no tom semântico.
 *
 * Substitui os mapas locais de `statusConfig` com cor crua: quem chama
 * escolhe o tom (ver `src/lib/statusUi.ts`) e a etiqueta cuida do visual.
 */
export function Etiqueta({ tom = "neutral", icone, ponto = false, solida = false, tamanho = "sm", title, className, children }: Props) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border font-semibold leading-none",
        tamanho === "sm" ? "h-5 px-2 text-[11px]" : "h-6 px-2.5 text-xs",
        solida ? cn("border-transparent", SOLIDA[tom]) : cn(TOM[tom].caixa, TOM[tom].borda),
        className,
      )}
    >
      {ponto && <span className={cn("h-1.5 w-1.5 rounded-full", solida ? "bg-current/70" : TOM[tom].ponto)} aria-hidden="true" />}
      {icone && (
        <span className="[&>svg]:h-3 [&>svg]:w-3" aria-hidden="true">
          {icone}
        </span>
      )}
      {children}
    </span>
  );
}
