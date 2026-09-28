import { Etiqueta } from "@/components/painel/Etiqueta";
import { STATUS_COBRANCA, type StatusCobranca } from "@/lib/cobrancaMeta";

/** Etiqueta de status de cobrança, com rótulo e tom do vocabulário único. */
export function EtiquetaStatusCobranca({
  status,
  tamanho = "sm",
  className,
}: {
  status: string | null | undefined;
  tamanho?: "sm" | "md";
  className?: string;
}) {
  const meta = STATUS_COBRANCA[status as StatusCobranca];
  return (
    <Etiqueta tom={meta?.tom ?? "neutral"} ponto tamanho={tamanho} title={meta?.ajuda} className={className}>
      {meta?.rotulo ?? status ?? "—"}
    </Etiqueta>
  );
}
