import { useEffect, useState } from "react";
import { Loader2, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { MaintenanceItem } from "./listaTipos";

interface Props {
  item: MaintenanceItem | null;
  enviando: boolean;
  onCancelar: () => void;
  onConfirmar: (mensagem: string) => void;
}

/**
 * Abre o debate de uma manutenção com o proprietário: ela vira chamado
 * (aparece em "Meus chamados" dele) com a mensagem digitada aqui e os anexos.
 */
export function DebateDialog({ item, enviando, onCancelar, onConfirmar }: Props) {
  const [mensagem, setMensagem] = useState("");

  useEffect(() => {
    if (item) setMensagem("");
  }, [item]);

  return (
    <Dialog open={!!item} onOpenChange={(aberto) => !aberto && !enviando && onCancelar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessagesSquare className="h-4 w-4 text-secondary" />
            Debater com o proprietário
          </DialogTitle>
          <DialogDescription>
            A manutenção vira um chamado na caixa de {item?.owner?.name ?? "do proprietário"}, com os anexos, e ele é
            avisado. Ela sai dos quadros de manutenção e fica em "Em debate com o proprietário" até você devolver.
          </DialogDescription>
        </DialogHeader>

        {item && (
          <div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-sm">
            <p className="font-medium">{item.subject}</p>
            <p className="text-xs text-muted-foreground">
              {item.property?.name ?? "Sem imóvel"}
              {item.attachments_count ? ` · ${item.attachments_count} ${item.attachments_count === 1 ? "anexo" : "anexos"}` : ""}
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="mensagem-debate">Mensagem para o proprietário</Label>
          <Textarea
            id="mensagem-debate"
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            placeholder="Explique o que precisa ser decidido."
            rows={5}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">As notas internas da equipe continuam invisíveis para ele.</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancelar} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={() => onConfirmar(mensagem.trim())} disabled={enviando || !mensagem.trim()}>
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
            Abrir debate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
