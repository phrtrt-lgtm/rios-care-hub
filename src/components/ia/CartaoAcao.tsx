import { Check, Loader2, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AcaoPendente } from "@/lib/iaMeta";
import { rotuloFerramenta } from "@/lib/iaMeta";
import type { DecisaoAcao } from "@/hooks/useAssistenteIA";

interface Props {
  acao: AcaoPendente;
  decisao?: DecisaoAcao;
  ocupado: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

const DECISAO_ROTULO: Record<DecisaoAcao, string> = {
  confirmada: "Confirmada e executada",
  cancelada: "Cancelada",
  expirada: "Expirou sem confirmação",
  erro: "Falhou",
};

const valorLegivel = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

/**
 * Cartão de confirmação de uma ação de escrita pedida pelo assistente
 * (PLANO_IA_AGENTE.md §2.4). Nada roda até a pessoa confirmar aqui.
 */
export function CartaoAcao({ acao, decisao, ocupado, onConfirmar, onCancelar }: Props) {
  // Ids ficam fora do cartão: o resumo já diz o imóvel e o chamado pelo nome.
  const campos = Object.entries(acao.entrada ?? {})
    .filter(([k]) => k !== "id" && !k.endsWith("_id"))
    .slice(0, 8);
  return (
    <div className="mt-2 w-full rounded-2xl border border-warning/40 bg-warning/10 p-3 text-[13px]">
      <div className="flex items-center gap-2 text-warning">
        <ShieldAlert className="h-4 w-4" aria-hidden="true" />
        <span className="font-semibold">Ação pedida pelo assistente · {rotuloFerramenta(acao.ferramenta)}</span>
      </div>
      <p className="mt-1.5 text-foreground">{acao.resumo}</p>
      {campos.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {campos.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-medium">{k.replace(/_/g, " ")}</dt>
              <dd className="truncate text-foreground">{valorLegivel(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {decisao ? (
        <p className="mt-2 text-xs font-medium text-muted-foreground">{DECISAO_ROTULO[decisao]}</p>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={onConfirmar} disabled={ocupado}>
            {ocupado ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
            Confirmar
          </Button>
          <Button size="sm" variant="outline" onClick={onCancelar} disabled={ocupado}>
            <X className="mr-1 h-3.5 w-3.5" />
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}
