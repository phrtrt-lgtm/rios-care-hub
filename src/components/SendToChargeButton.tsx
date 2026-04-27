import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface SendToChargeButtonProps {
  ticket: {
    id: string;
    subject: string;
    owner_id: string;
    property_id: string | null;
    cost_responsible: "owner" | "pm" | "guest" | null;
    charge_draft_amount_cents: number | null;
    charge_draft_management_contribution_cents: number | null;
    charge_draft_category: string | null;
    charge_draft_title: string | null;
    charge_sent_at: string | null;
  };
  onSuccess?: (chargeId: string) => void;
  variant?: "default" | "outline" | "secondary";
  size?: "default" | "sm" | "lg";
  className?: string;
}

export function SendToChargeButton({
  ticket,
  onSuccess,
  variant = "default",
  size = "default",
  className,
}: SendToChargeButtonProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);

  // Don't render if guest responsible, no draft, or already sent
  if (
    ticket.cost_responsible === "guest" ||
    !ticket.charge_draft_amount_cents ||
    ticket.charge_sent_at
  ) {
    return null;
  }

  const amountCents = ticket.charge_draft_amount_cents;
  const mgmtCents = ticket.charge_draft_management_contribution_cents || 0;
  const ownerPays = Math.max(0, amountCents - mgmtCents);

  const handleSend = async () => {
    if (!user) return;
    setSending(true);
    try {
      let chargeId: string | undefined;

      // Reactivate archived charge if any
      const { data: existingCharges } = await supabase
        .from("charges")
        .select("id")
        .eq("ticket_id", ticket.id)
        .not("archived_at", "is", null)
        .order("created_at", { ascending: false })
        .limit(1);

      if (existingCharges && existingCharges.length > 0) {
        const { error: updateErr } = await supabase
          .from("charges")
          .update({
            title: ticket.charge_draft_title || ticket.subject,
            amount_cents: amountCents,
            management_contribution_cents: mgmtCents,
            cost_responsible: ticket.cost_responsible,
            category: ticket.charge_draft_category,
            status: "sent",
            archived_at: null,
          })
          .eq("id", existingCharges[0].id);
        if (updateErr) throw updateErr;
        chargeId = existingCharges[0].id;
      } else {
        const { data: newCharge, error: chargeErr } = await supabase
          .from("charges")
          .insert({
            owner_id: ticket.owner_id,
            property_id: ticket.property_id,
            ticket_id: ticket.id,
            title: ticket.charge_draft_title || ticket.subject,
            amount_cents: amountCents,
            management_contribution_cents: mgmtCents,
            cost_responsible: ticket.cost_responsible,
            category: ticket.charge_draft_category,
            status: "sent",
          })
          .select("id")
          .single();
        if (chargeErr) throw chargeErr;
        chargeId = newCharge.id;
      }

      // Email notification
      if (chargeId) {
        try {
          await supabase.functions.invoke("send-charge-email", {
            body: { type: "charge_created", chargeId },
          });
        } catch (emailErr) {
          console.warn("Email notification failed (non-critical):", emailErr);
        }
      }

      // Migrate ticket attachments → charge_attachments
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

      // Mark ticket as charge_sent
      await supabase
        .from("tickets")
        .update({ charge_sent_at: new Date().toISOString() } as any)
        .eq("id", ticket.id);

      toast.success("Cobrança enviada ao proprietário!");
      setOpen(false);
      if (chargeId) onSuccess?.(chargeId);
    } catch (err: any) {
      toast.error("Erro ao enviar cobrança: " + err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          <Send className="h-4 w-4 mr-2" />
          Enviar para Cobrança
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Enviar cobrança ao proprietário?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                A cobrança será criada e o proprietário receberá um e-mail de notificação.
              </p>
              <div className="rounded-lg bg-muted/60 p-3 space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Título:</span>
                  <span className="font-medium">{ticket.charge_draft_title || ticket.subject}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor total:</span>
                  <span>R$ {(amountCents / 100).toFixed(2).replace(".", ",")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Aporte gestão:</span>
                  <span className="text-info">− R$ {(mgmtCents / 100).toFixed(2).replace(".", ",")}</span>
                </div>
                <div className="flex justify-between font-semibold border-t pt-1">
                  <span>Proprietário paga:</span>
                  <span>R$ {(ownerPays / 100).toFixed(2).replace(".", ",")}</span>
                </div>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={sending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); handleSend(); }} disabled={sending}>
            {sending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</> : "Confirmar e Enviar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
