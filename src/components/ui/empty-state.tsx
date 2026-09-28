import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Ilustrações de estado vazio em `public/ilustracoes/*.webp` (480×360,
 * fundo transparente, paleta terracota + azul). Geradas em 2026-09-28.
 */
export type Ilustracao = "chamados" | "cobrancas" | "manutencoes" | "conversa" | "busca";

interface EmptyStateProps {
  icon?: ReactNode;
  /** Ilustração no lugar do ícone; use nos vazios de página inteira. */
  ilustracao?: Ilustracao;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, ilustracao, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 text-center",
        className
      )}
    >
      {ilustracao ? (
        <img
          src={`/ilustracoes/${ilustracao}.webp`}
          alt=""
          width={480}
          height={360}
          loading="lazy"
          className="mb-2 h-auto w-40 select-none dark:opacity-90 sm:w-48"
          aria-hidden="true"
        />
      ) : (
        icon && (
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-3">
            {icon}
          </div>
        )
      )}
      <h3 className="text-base font-medium">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
