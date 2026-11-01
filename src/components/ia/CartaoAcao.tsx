import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ArrowUpRight, Check, CheckCircle2, Clock, Loader2, ShieldAlert, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AcaoPendente } from "@/lib/iaMeta";
import { rotuloFerramenta } from "@/lib/iaMeta";
import type { DecisaoAcao } from "@/hooks/useAssistenteIA";
import { PixBloqueio } from "@/components/bloqueios/PixBloqueio";
import { cn } from "@/lib/utils";

interface Props {
  acao: AcaoPendente;
  decisao?: DecisaoAcao;
  /** O que a ação devolveu depois de confirmada (PIX do bloqueio, link do chamado). */
  resultado?: Record<string, unknown> | null;
  ocupado: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

const ESTADO: Record<DecisaoAcao, { rotulo: string; Icone: LucideIcon; borda: string; texto: string }> = {
  confirmada: { rotulo: "Confirmada e executada", Icone: CheckCircle2, borda: "border-success/40", texto: "text-success" },
  cancelada: { rotulo: "Cancelada", Icone: XCircle, borda: "border-border", texto: "text-muted-foreground" },
  expirada: { rotulo: "Expirou sem confirmação", Icone: Clock, borda: "border-border", texto: "text-muted-foreground" },
  erro: { rotulo: "Falhou", Icone: AlertTriangle, borda: "border-destructive/40", texto: "text-destructive" },
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
export function CartaoAcao({ acao, decisao, resultado, ocupado, onConfirmar, onCancelar }: Props) {
  // Ids ficam fora do cartão: o resumo já diz o imóvel e o chamado pelo nome.
  const campos = Object.entries(acao.entrada ?? {})
    .filter(([k]) => k !== "id" && !k.endsWith("_id"))
    .slice(0, 8);
  const pedidoPix = acao.ferramenta === "pedir_bloqueio_de_datas" && typeof resultado?.pedido_id === "string" ? resultado.pedido_id : null;
  const link = typeof resultado?.link === "string" && resultado.link.startsWith("/") ? resultado.link : null;
  const estado = decisao ? ESTADO[decisao] : null;

  return (
    <div
      className={cn(
        "mt-2 w-full overflow-hidden rounded-2xl border bg-card text-[13px] shadow-sm",
        estado ? estado.borda : "border-warning/40",
      )}
    >
      {!estado && <div className="h-1 bg-gradient-to-r from-warning to-primary" aria-hidden="true" />}
      <div className="p-3">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
              estado ? `bg-muted ${estado.texto}` : "bg-warning/15 text-warning",
            )}
          >
            {estado ? <estado.Icone className="h-4 w-4" aria-hidden="true" /> : <ShieldAlert className="h-4 w-4" aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {estado ? "Ação do assistente" : "Ação pedida pelo assistente"}
            </p>
            <p className="truncate text-sm font-semibold text-foreground">{rotuloFerramenta(acao.ferramenta)}</p>
          </div>
        </div>

        <p className="mt-2.5 text-sm leading-relaxed text-foreground">{acao.resumo}</p>

        {campos.length > 0 && (
          <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl bg-muted/50 px-3 py-2">
            {campos.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{k.replace(/_/g, " ")}</dt>
                <dd className="truncate text-xs text-foreground">{valorLegivel(v)}</dd>
              </div>
            ))}
          </dl>
        )}

        {estado ? (
          <>
            <p className={cn("mt-3 flex items-center gap-1.5 text-xs font-medium", estado.texto)}>
              <estado.Icone className="h-3.5 w-3.5" aria-hidden="true" />
              {estado.rotulo}
            </p>
            {decisao === "confirmada" && pedidoPix && <PixBloqueio pedidoId={pedidoPix} />}
            {decisao === "confirmada" && link && (
              <Link to={link} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                Abrir no portal <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            )}
          </>
        ) : (
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={onConfirmar} disabled={ocupado} className="rounded-xl">
              {ocupado ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />}
              Confirmar
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancelar} disabled={ocupado} className="rounded-xl">
              <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Cancelar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
