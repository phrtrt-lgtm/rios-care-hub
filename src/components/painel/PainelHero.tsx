import type { ReactNode } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { primeiroNome, saudacao } from "./tons";

interface Props {
  nome?: string | null;
  /** Linha abaixo da saudação: o que a pessoa encontra na página. */
  subtitulo?: string;
  /** Ações à direita (botões de criar, por exemplo). */
  acoes?: ReactNode;
}

/** Abertura da página: data, saudação com o primeiro nome e subtítulo. */
export function PainelHero({ nome, subtitulo, acoes }: Props) {
  const hoje = new Date();
  const primeiro = primeiroNome(nome);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground first-letter:uppercase md:text-sm">
          {format(hoje, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
        </p>
        <h1 className="mt-0.5 truncate text-2xl font-semibold tracking-tight md:text-3xl">
          {saudacao(hoje)}
          {primeiro ? `, ${primeiro}` : ""}
        </h1>
        {subtitulo && <p className="mt-1 text-sm text-muted-foreground">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex shrink-0 flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}
