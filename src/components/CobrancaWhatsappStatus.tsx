import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, MessageCircle, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Props {
  cobrancaId: string;
  status: "enviado" | "falhou" | "desativado" | null | undefined;
  enviadoEm?: string | null;
  erro?: string | null;
  /** Só admin vê o botão de reenvio. */
  podeReenviar: boolean;
  /** Recarrega a cobrança depois do reenvio. */
  onAtualizado: () => void;
}

const ROTULO: Record<string, { texto: string; classe: string }> = {
  enviado: { texto: "WhatsApp enviado", classe: "text-success" },
  falhou: { texto: "WhatsApp falhou", classe: "text-destructive" },
  desativado: { texto: "WhatsApp desativado para este proprietário", classe: "text-muted-foreground" },
};

/**
 * Status da notificação de cobrança por WhatsApp, visível só para a equipe.
 * O envio é disparado pelo backend (trigger em charges → notificar-cobranca);
 * aqui só mostramos o resultado e permitimos reenviar.
 */
export function CobrancaWhatsappStatus({
  cobrancaId,
  status,
  enviadoEm,
  erro,
  podeReenviar,
  onAtualizado,
}: Props) {
  const [reenviando, setReenviando] = useState(false);
  const rotulo = status ? ROTULO[status] : null;

  const reenviar = async () => {
    setReenviando(true);
    try {
      const { data, error } = await supabase.functions.invoke("notificar-cobranca", {
        body: { cobranca_id: cobrancaId, reenviar: true },
      });
      if (error) throw error;
      if (data?.status === "enviado") toast.success("WhatsApp reenviado ao proprietário.");
      else if (data?.status === "desativado") toast.info("Este proprietário está com o WhatsApp desativado.");
      else toast.error(`Não foi possível enviar: ${data?.erro || "erro desconhecido"}`);
    } catch (e: any) {
      toast.error(`Não foi possível reenviar o WhatsApp: ${e?.message || e}`);
    } finally {
      setReenviando(false);
      onAtualizado();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <MessageCircle className={cn("h-3.5 w-3.5", rotulo?.classe ?? "text-muted-foreground")} aria-hidden="true" />
      <span className={cn("font-medium", rotulo?.classe ?? "text-muted-foreground")}>
        {rotulo?.texto ?? "WhatsApp não enviado"}
      </span>
      {status === "enviado" && enviadoEm && (
        <span className="text-muted-foreground">
          em {format(new Date(enviadoEm), "dd/MM 'às' HH:mm", { locale: ptBR })}
        </span>
      )}
      {status === "falhou" && erro && (
        <span className="text-muted-foreground break-words max-w-full">— {erro}</span>
      )}
      {podeReenviar && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs gap-1"
          onClick={reenviar}
          disabled={reenviando}
        >
          {reenviando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Reenviar WhatsApp
        </Button>
      )}
    </div>
  );
}
