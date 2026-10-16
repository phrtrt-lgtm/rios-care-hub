import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Ajuste } from "@/hooks/useAjustes";

interface Props {
  ajuste: Ajuste | null;
  status: "feito" | "descartado";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salvando: boolean;
  onConfirmar: (resposta: string) => void;
}

/** Concluir (ou dizer que não precisa) com uma observação que quem avisou vai ler. */
export function DialogoResposta({ ajuste, status, open, onOpenChange, salvando, onConfirmar }: Props) {
  const [texto, setTexto] = useState("");

  useEffect(() => {
    if (open) setTexto(ajuste?.resposta ?? "");
  }, [open, ajuste]);

  const feito = status === "feito";
  const jaResolvido = ajuste?.status === status;

  return (
    <Dialog open={open} onOpenChange={(aberto) => !salvando && onOpenChange(aberto)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{jaResolvido ? "Observação" : feito ? "Marcar como feito" : "Não precisa mudar"}</DialogTitle>
          <DialogDescription>
            {feito ? "Conte o que foi feito." : "Explique por quê."} Quem avisou vê esta observação.
          </DialogDescription>
        </DialogHeader>

        {ajuste && (
          <p className="line-clamp-3 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">{ajuste.descricao}</p>
        )}

        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          maxLength={1000}
          autoFocus
          aria-label="Observação"
          placeholder={feito ? "Ex.: corrigido no Airbnb e na Hostex." : "Ex.: já estava certo; a senha continua a mesma."}
          className="text-sm"
        />

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant={feito ? "success" : "default"}
            onClick={() => onConfirmar(texto)}
            disabled={salvando}
            className="gap-2"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {jaResolvido ? "Salvar" : feito ? "Marcar como feito" : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
