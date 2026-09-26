import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  id?: string;
  titulo: string;
  subtitulo?: string;
  /** Conteúdo à direita: um botão "Ver todos", um contador, etc. */
  acao?: ReactNode;
  className?: string;
}

/** Título de seção do painel: barra de acento, título e subtítulo discreto. */
export function TituloSecao({ id, titulo, subtitulo, acao, className }: Props) {
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="h-5 w-1 shrink-0 rounded-full bg-primary" aria-hidden="true" />
        <div className="min-w-0">
          <h2 id={id} className="text-base font-semibold leading-tight tracking-tight md:text-lg">
            {titulo}
          </h2>
          {subtitulo && <p className="truncate text-xs text-muted-foreground md:text-sm">{subtitulo}</p>}
        </div>
      </div>
      {acao && <div className="shrink-0">{acao}</div>}
    </div>
  );
}
