import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, User, Building2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CHARGE_CATEGORY_OPTIONS } from "@/constants/chargeCategories";
import { toast } from "sonner";

export interface CompleteMaintenanceTicket {
  id: string;
  subject: string;
  cost_responsible: "owner" | "pm" | "guest" | null;
  owner?: { id: string; name: string } | null;
  property?: { id: string; name: string } | null;
}

interface CompleteMaintenanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: CompleteMaintenanceTicket | null;
  onSuccess?: () => void;
}

export function CompleteMaintenanceDialog({
  open,
  onOpenChange,
  ticket,
  onSuccess,
}: CompleteMaintenanceDialogProps) {
  const { user } = useAuth();

  const [costResponsible, setCostResponsible] = useState<"owner" | "pm" | "guest">("owner");
  const [guestCheckoutDate, setGuestCheckoutDate] = useState("");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [managementContribution, setManagementContribution] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset state when ticket changes
  useEffect(() => {
    if (ticket) {
      const responsible = ticket.cost_responsible || "owner";
      setCostResponsible(responsible);
      setTitle(ticket.subject);
      setAmount("");
      setCategory("");
      setGuestCheckoutDate("");
      // Auto-fill management contribution for "pm"
      setManagementContribution(responsible === "pm" ? "" : "0");
    }
  }, [ticket]);

  // When cost_responsible changes, auto-adjust contribution hint
  useEffect(() => {
    if (costResponsible === "pm") {
      // Will be set equal to amount automatically on submit
      setManagementContribution("");
    } else if (costResponsible === "guest") {
      setManagementContribution("0");
    }
  }, [costResponsible]);

  // When amount changes and it's pm, keep contribution in sync
  useEffect(() => {
    if (costResponsible === "pm" && amount) {
      setManagementContribution(amount);
    }
  }, [amount, costResponsible]);

  if (!ticket) return null;

  const amountNum = parseFloat(amount || "0");
  const contributionNum = parseFloat(managementContribution || "0");
  const ownerPays = Math.max(0, amountNum - contributionNum);

  const handleComplete = async () => {
    if (!user) return;
    if (costResponsible !== "guest" && !amount) {
      toast.error("Informe o valor total");
      return;
    }
    if (costResponsible === "guest" && !guestCheckoutDate) {
      toast.error("Informe a data de check-out do hóspede");
      return;
    }

    setSaving(true);
    try {
      const amountCents = costResponsible !== "guest" ? Math.round(amountNum * 100) : null;
      const mgmtCents = costResponsible === "pm"
        ? amountCents
        : costResponsible === "owner"
        ? Math.round(contributionNum * 100)
        : null;

      // Update ticket: concluded + cost_responsible + draft fields (NO charge created here)
      const updatePayload: any = {
        status: "concluido",
        cost_responsible: costResponsible,
      };

      if (costResponsible !== "guest") {
        updatePayload.charge_draft_amount_cents = amountCents;
        updatePayload.charge_draft_management_contribution_cents = mgmtCents;
        updatePayload.charge_draft_category = category || null;
        updatePayload.charge_draft_title = title || ticket.subject;
      } else {
        updatePayload.guest_checkout_date = guestCheckoutDate;
      }

      const { error: ticketErr } = await supabase
        .from("tickets")
        .update(updatePayload)
        .eq("id", ticket.id);
      if (ticketErr) throw ticketErr;

      toast.success(
        costResponsible === "guest"
          ? "Manutenção concluída! Aviso automático configurado para o check-out."
          : "Manutenção concluída! Use 'Enviar para Cobrança' quando estiver pronto."
      );
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error("Erro ao concluir: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const responsibleLabel = {
    owner: "Proprietário",
    pm: "Gestão",
    guest: "Hóspede",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Concluir Manutenção</DialogTitle>
          <DialogDescription>
            Defina o responsável pelo custo e finalize a manutenção
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Ticket info */}
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="font-medium text-sm">{ticket.subject}</p>
            {ticket.property && (
              <p className="text-xs text-muted-foreground">{ticket.property.name} • {ticket.owner?.name}</p>
            )}
          </div>

          {/* Cost Responsible */}
          <div className="space-y-2">
            <Label>Responsável pelo custo *</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["owner", "pm", "guest"] as const).map((r) => {
                const icons = { owner: User, pm: Building2, guest: Users };
                const Icon = icons[r];
                const colors = {
                  owner: "border-primary bg-primary/10 text-primary",
                  pm: "border-info/30 bg-info/10 text-info",
                  guest: "border-warning/30 bg-warning/10 text-warning",
                };
                const selected = costResponsible === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setCostResponsible(r)}
                    className={`rounded-lg border-2 p-2 flex flex-col items-center gap-1 transition-all text-xs font-medium ${
                      selected ? colors[r] : "border-border bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {responsibleLabel[r]}
                  </button>
                );
              })}
            </div>

            {/* Contextual description */}
            {costResponsible === "guest" && (
              <Alert className="border-warning/30/30 bg-warning/5">
                <AlertCircle className="h-4 w-4 text-warning" />
                <AlertDescription className="text-warning text-xs">
                  Dano de hóspede — informe o check-out para receber um aviso automático de cobrança.
                  Esta manutenção <strong>não aparece</strong> para o proprietário.
                </AlertDescription>
              </Alert>
            )}
            {costResponsible === "pm" && (
              <Alert className="border-info/30/30 bg-info/5">
                <AlertCircle className="h-4 w-4 text-info" />
                <AlertDescription className="text-info text-xs">
                  Gestão assume 100% — o aporte será igual ao valor total, zerada para o proprietário.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Guest checkout date */}
          {costResponsible === "guest" && (
            <div className="space-y-2">
              <Label htmlFor="guestCheckout">Data de Check-out do Hóspede *</Label>
              <Input
                id="guestCheckout"
                type="date"
                value={guestCheckoutDate}
                onChange={(e) => setGuestCheckoutDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                O sistema enviará um aviso 14 dias antes do check-out para cobrar o hóspede.
              </p>
            </div>
          )}

          {/* Charge fields for owner and pm */}
          {costResponsible !== "guest" && (
            <div className="space-y-4 border-t pt-4">
              <div className="space-y-2">
                <Label htmlFor="title">Título da cobrança</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Reparo torneira banheiro"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Categoria</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {CHARGE_CATEGORY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="amount">Valor Total (R$) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0,00"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contribution">
                    Aporte Gestão (R$)
                    {costResponsible === "pm" && (
                      <Badge variant="secondary" className="ml-1 text-[10px]">Auto</Badge>
                    )}
                  </Label>
                  <Input
                    id="contribution"
                    type="number"
                    step="0.01"
                    min="0"
                    value={managementContribution}
                    onChange={(e) => {
                      if (costResponsible !== "pm") setManagementContribution(e.target.value);
                    }}
                    placeholder="0,00"
                    readOnly={costResponsible === "pm"}
                    className={costResponsible === "pm" ? "bg-muted cursor-not-allowed" : ""}
                  />
                </div>
              </div>

              {/* Summary */}
              {amount && (
                <div className="rounded-lg bg-muted/60 p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Valor total:</span>
                    <span>R$ {amountNum.toFixed(2).replace(".", ",")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Aporte gestão:</span>
                    <span className="text-info">
                      − R$ {(costResponsible === "pm" ? amountNum : contributionNum).toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold border-t pt-1">
                    <span>Proprietário paga:</span>
                    <span className={ownerPays === 0 ? "text-success" : "text-foreground"}>
                      R$ {(costResponsible === "pm" ? 0 : ownerPays).toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={handleComplete}
              disabled={
                saving ||
                (costResponsible !== "guest" && !amount) ||
                (costResponsible === "guest" && !guestCheckoutDate)
              }
            >
              {saving
                ? "Salvando..."
                : costResponsible === "guest"
                ? "Concluir (Hóspede)"
                : "Concluir manutenção"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
