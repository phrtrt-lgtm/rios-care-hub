import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const ROTULO: Record<string, { texto: string; classe: string }> = {
  enviado: { texto: "WhatsApp enviado", classe: "text-success" },
  parcial: { texto: "WhatsApp em parte", classe: "text-warning" },
  falhou: { texto: "WhatsApp falhou", classe: "text-destructive" },
  sem_destino: { texto: "Sem WhatsApp de destino", classe: "text-muted-foreground" },
  desativado: { texto: "Aviso desligado", classe: "text-muted-foreground" },
};

/**
 * Resultado do aviso por WhatsApp de um item novo (coluna notificacao_status,
 * gravada pela function notificar-listas). Nada aparece enquanto não há
 * resultado, nem quando quem criou é o próprio destino.
 */
export function SeloWhatsapp({ status, erro, className }: { status?: string | null; erro?: string | null; className?: string }) {
  const meta = status ? ROTULO[status] : undefined;
  if (!meta) return null;
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-[11px]", meta.classe, className)}
      title={erro ? `${meta.texto}: ${erro}` : meta.texto}
    >
      <MessageCircle className="h-3 w-3" aria-hidden="true" />
      {meta.texto}
    </span>
  );
}
