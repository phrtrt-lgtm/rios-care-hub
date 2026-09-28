import { cn } from "@/lib/utils";
import { formatarBRL, valorDevido, type ValoresCobranca } from "@/lib/cobrancaMeta";

interface Props {
  cobranca: ValoresCobranca;
  /** compacto = uma linha de três ou quatro números (listas); completo = bloco de detalhe. */
  variante?: "compacto" | "completo";
  className?: string;
}

/**
 * Total, aporte da gestão, crédito aplicado e valor a pagar, sempre com a
 * mesma conta (`valorDevido`). Antes a conta estava escrita inline em 14
 * lugares e quatro deles esqueciam o crédito.
 */
export function ResumoValorCobranca({ cobranca, variante = "completo", className }: Props) {
  const total = cobranca.amount_cents ?? 0;
  const aporte = cobranca.management_contribution_cents ?? 0;
  const credito = cobranca.credit_applied_cents ?? 0;
  const devido = valorDevido(cobranca);
  const gratuita = total > 0 && devido === 0;

  if (variante === "compacto") {
    return (
      <dl className={cn("flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs", className)}>
        <div>
          <dt className="sr-only">Total</dt>
          <dd className="text-muted-foreground">
            Total <span className="tabular-nums text-foreground">{formatarBRL(total)}</span>
          </dd>
        </div>
        {aporte > 0 && (
          <div>
            <dt className="sr-only">Aporte da gestão</dt>
            <dd className="text-muted-foreground">
              Aporte <span className="tabular-nums text-success">−{formatarBRL(aporte)}</span>
            </dd>
          </div>
        )}
        {credito > 0 && (
          <div>
            <dt className="sr-only">Crédito aplicado</dt>
            <dd className="text-muted-foreground">
              Crédito <span className="tabular-nums text-success">−{formatarBRL(credito)}</span>
            </dd>
          </div>
        )}
        <div className="ml-auto">
          <dt className="sr-only">A pagar</dt>
          <dd className={cn("text-sm font-semibold tabular-nums", gratuita ? "text-success" : "text-foreground")}>
            {gratuita ? "Sem custo" : formatarBRL(devido)}
          </dd>
        </div>
      </dl>
    );
  }

  return (
    <div className={cn("rounded-xl border border-border/70 bg-muted/40", className)}>
      <dl className="divide-y divide-border/60">
        <Linha rotulo="Valor total" valor={formatarBRL(total)} />
        {aporte > 0 && <Linha rotulo="Aporte da gestão" valor={`−${formatarBRL(aporte)}`} tom="success" />}
        {credito > 0 && <Linha rotulo="Crédito aplicado" valor={`−${formatarBRL(credito)}`} tom="success" />}
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <dt className="text-sm font-semibold">A pagar</dt>
          <dd className={cn("text-xl font-bold tabular-nums", gratuita ? "text-success" : "text-foreground")}>
            {gratuita ? "Sem custo" : formatarBRL(devido)}
          </dd>
        </div>
      </dl>
      {gratuita && (
        <p className="border-t border-border/60 px-4 py-2 text-xs text-muted-foreground">
          A gestão cobriu o valor integral desta cobrança.
        </p>
      )}
    </div>
  );
}

function Linha({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: "success" }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className={cn("tabular-nums", tom === "success" && "text-success")}>{valor}</dd>
    </div>
  );
}
