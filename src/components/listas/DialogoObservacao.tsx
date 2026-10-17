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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salvando: boolean;
  titulo: string;
  descricao: string;
  /** O item em questão, citado acima do campo. */
  trecho?: string;
  valorInicial?: string | null;
  placeholder: string;
  textoConfirmar: string;
  variante?: "success" | "default";
  onConfirmar: (texto: string) => void;
}

/** Concluir um item (ajuste, compra) com uma observação que quem pediu vai ler. */
export function DialogoObservacao({
  open,
  onOpenChange,
  salvando,
  titulo,
  descricao,
  trecho,
  valorInicial,
  placeholder,
  textoConfirmar,
  variante = "default",
  onConfirmar,
}: Props) {
  const [texto, setTexto] = useState("");

  useEffect(() => {
    if (open) setTexto(valorInicial ?? "");
  }, [open, valorInicial]);

  return (
    <Dialog open={open} onOpenChange={(aberto) => !salvando && onOpenChange(aberto)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>

        {trecho && (
          <p className="line-clamp-3 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">{trecho}</p>
        )}

        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          maxLength={1000}
          autoFocus
          aria-label="Observação"
          placeholder={placeholder}
          className="text-sm"
        />

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="button" variant={variante} onClick={() => onConfirmar(texto)} disabled={salvando} className="gap-2">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {textoConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
