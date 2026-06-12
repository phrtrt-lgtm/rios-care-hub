import { Badge } from "@/components/ui/badge";

const LABEL: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft_rios: { label: "Rascunho RIOS", variant: "outline" },
  awaiting_owner: { label: "Aguardando proprietário", variant: "secondary" },
  owner_filling: { label: "Em preenchimento", variant: "secondary" },
  submitted: { label: "Dados enviados", variant: "default" },
  correction_requested: { label: "Correção solicitada", variant: "destructive" },
  approved: { label: "Dados aprovados", variant: "default" },
  generated: { label: "Contrato gerado", variant: "default" },
  signed: { label: "Assinado", variant: "default" },
  cancelled: { label: "Cancelado", variant: "outline" },
};

export function ContractStatusBadge({ status }: { status: string }) {
  const item = LABEL[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={item.variant}>{item.label}</Badge>;
}
