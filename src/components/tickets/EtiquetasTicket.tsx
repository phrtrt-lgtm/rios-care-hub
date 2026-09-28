import { AlertTriangle } from "lucide-react";
import { Etiqueta } from "@/components/painel/Etiqueta";
import {
  PRIORIDADE_TICKET,
  STATUS_TICKET,
  TIPO_TICKET,
  type PrioridadeTicket,
  type StatusTicket,
  type TipoTicket,
} from "@/lib/ticketMeta";

/** Etiqueta de status do chamado, com rótulo e tom do vocabulário único. */
export function EtiquetaStatusTicket({ status, className }: { status: string | null | undefined; className?: string }) {
  const meta = STATUS_TICKET[status as StatusTicket];
  return (
    <Etiqueta tom={meta?.tom ?? "neutral"} ponto className={className}>
      {meta?.rotulo ?? status ?? "—"}
    </Etiqueta>
  );
}

/**
 * Etiqueta de prioridade. "Normal" não é exibida por padrão: só o urgente
 * precisa chamar atenção. Passe `mostrarNormal` em telas de edição.
 */
export function EtiquetaPrioridadeTicket({
  prioridade,
  mostrarNormal = false,
  className,
}: {
  prioridade: string | null | undefined;
  mostrarNormal?: boolean;
  className?: string;
}) {
  const meta = PRIORIDADE_TICKET[prioridade as PrioridadeTicket];
  if (!meta) return null;
  if (prioridade === "normal" && !mostrarNormal) return null;
  return (
    <Etiqueta tom={meta.tom} icone={prioridade === "urgente" ? <AlertTriangle /> : undefined} className={className}>
      {meta.rotulo}
    </Etiqueta>
  );
}

/** Etiqueta de tipo do chamado (Manutenção, Dúvida, Financeiro...). */
export function EtiquetaTipoTicket({ tipo, className }: { tipo: string | null | undefined; className?: string }) {
  const meta = TIPO_TICKET[tipo as TipoTicket];
  return (
    <Etiqueta tom="neutral" className={className}>
      {meta?.rotulo ?? tipo ?? "—"}
    </Etiqueta>
  );
}
