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
  onSuccess?: (chargeId?: string) => void;
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
      // 1. Update ticket to concluded + cost_responsible
      const { error: ticketErr } = await supabase
        .from("tickets")
        .update({ status: "concluido", cost_responsible: costResponsible })
        .eq("id", ticket.id);
      if (ticketErr) throw ticketErr;

      let chargeId: string | undefined;

      if (costResponsible !== "guest") {
        const amountCents = Math.round(amountNum * 100);
        const mgmtCents = costResponsible === "pm"
          ? amountCents // gestão assume 100%
          : Math.round(contributionNum * 100);

        // 2. Check for existing archived charge linked to this ticket (reactivate)
        const { data: existingCharges } = await supabase
          .from("charges")
          .select("id")
          .eq("ticket_id", ticket.id)
          .not("archived_at", "is", null)
          .order("created_at", { ascending: false })
          .limit(1);

        if (existingCharges && existingCharges.length > 0) {
          // Reactivate archived charge
          const { error: updateErr } = await supabase
            .from("charges")
            .update({
              title: title || ticket.subject,
              amount_cents: amountCents,
              management_contribution_cents: mgmtCents,
              cost_responsible: costResponsible,
              category: category || null,
              status: "sent",
              archived_at: null,
            })
            .eq("id", existingCharges[0].id);
          if (updateErr) throw updateErr;
          chargeId = existingCharges[0].id;
        } else {
          // 3. Create new charge
          const { data: newCharge, error: chargeErr } = await supabase
            .from("charges")
            .insert({
              owner_id: ticket.owner?.id!,
              property_id: ticket.property?.id || null,
              ticket_id: ticket.id,
              title: title || ticket.subject,
              amount_cents: amountCents,
              management_contribution_cents: mgmtCents,
              cost_responsible: costResponsible,
              category: category || null,
              status: "sent",
            })
            .select("id")
            .single();
          if (chargeErr) throw chargeErr;
          chargeId = newCharge.id;
        }

        // 4. Send charge_created email notification
        if (chargeId) {
          try {
            await supabase.functions.invoke("send-charge-email", {
              body: { type: "charge_created", chargeId },
            });
          } catch (emailErr) {
            console.warn("Email notification failed (non-critical):", emailErr);
          }
        }

        // 5. Migrate ticket attachments → charge_attachments
        if (chargeId) {
          const { data: ticketAttachments } = await supabase
            .from("ticket_attachments")
            .select("*")
            .eq("ticket_id", ticket.id);

          if (ticketAttachments && ticketAttachments.length > 0) {
            const mapped = ticketAttachments.map((a: any) => ({
              charge_id: chargeId,
              file_name: a.file_name || a.file_url?.split("/").pop() || "arquivo",
              file_path: a.file_url || a.file_path || "",
              file_size: a.size_bytes || a.file_size || null,
              mime_type: a.file_type || a.mime_type || null,
              created_by: a.author_id || user.id,
            }));
            await supabase.from("charge_attachments").insert(mapped);
          }
        }

      } else {
        // Guest responsible: set guest_checkout_date via ticket update
        await supabase
          .from("tickets")
          .update({ guest_checkout_date: guestCheckoutDate } as any)
          .eq("id", ticket.id);
      }

      toast.success(
        costResponsible === "guest"
          ? "Manutenção concluída! Aviso automático configurado para o check-out."
          : costResponsible === "pm"
          ? "Manutenção concluída com aporte integral da gestão!"
          : "Manutenção concluída e cobrança criada!"
      );
      onOpenChange(false);
      onSuccess?.(chargeId);
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
                  pm: "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-400",
                  guest: "border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-400",
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
              <Alert className="border-orange-500/30 bg-orange-500/5">
                <AlertCircle className="h-4 w-4 text-orange-600" />
                <AlertDescription className="text-orange-700 dark:text-orange-400 text-xs">
                  Dano de hóspede — informe o check-out para receber um aviso automático de cobrança.
                  Esta manutenção <strong>não aparece</strong> para o proprietário.
                </AlertDescription>
              </Alert>
            )}
            {costResponsible === "pm" && (
              <Alert className="border-blue-500/30 bg-blue-500/5">
                <AlertCircle className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-700 dark:text-blue-400 text-xs">
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
                    <span className="text-blue-600 dark:text-blue-400">
                      − R$ {(costResponsible === "pm" ? amountNum : contributionNum).toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold border-t pt-1">
                    <span>Proprietário paga:</span>
                    <span className={ownerPays === 0 ? "text-green-600" : "text-foreground"}>
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
                : costResponsible === "pm"
                ? "Concluir (Gestão paga)"
                : "Concluir e Cobrar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
