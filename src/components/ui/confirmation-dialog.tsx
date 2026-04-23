import { ReactNode, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Texto ou ReactNode (pode incluir blocos de aviso, listas, etc) */
  description: string | ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  /** Se preenchido, usuário precisa digitar exatamente esse texto pra habilitar o confirmar */
  requireTypedConfirmation?: string;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  variant = "default",
  requireTypedConfirmation,
  onConfirm,
  loading = false,
}: ConfirmationDialogProps) {
  const [typed, setTyped] = useState("");

  // Reset confirmação digitada quando dialog reabre
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  const typedOk =
    !requireTypedConfirmation || typed === requireTypedConfirmation;
  const disabled = loading || !typedOk;

  const handleConfirm = async () => {
    if (disabled) return;
    await onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {typeof description === "string" ? (
            <DialogDescription>{description}</DialogDescription>
          ) : (
            <div className="text-sm text-muted-foreground space-y-3 pt-2">
              {description}
            </div>
          )}
        </DialogHeader>

        {requireTypedConfirmation && (
          <div className="space-y-2">
            <Label htmlFor="typed-confirm" className="text-sm">
              Digite{" "}
              <span className="font-mono font-bold text-foreground">
                {requireTypedConfirmation}
              </span>{" "}
              para confirmar
            </Label>
            <Input
              id="typed-confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={requireTypedConfirmation}
              autoComplete="off"
              autoFocus
              disabled={loading}
            />
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={disabled}
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
