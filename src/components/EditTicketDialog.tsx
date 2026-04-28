import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface EditTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string | null;
  onSaved?: () => void;
}

type TicketRow = {
  id: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  property_id: string | null;
  ticket_type: string;
};

export function EditTicketDialog({ open, onOpenChange, ticketId, onSaved }: EditTicketDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ticket, setTicket] = useState<TicketRow | null>(null);
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!open || !ticketId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [{ data: t, error }, { data: props }] = await Promise.all([
          supabase
            .from("tickets")
            .select("id, subject, description, priority, status, property_id, ticket_type")
            .eq("id", ticketId)
            .single(),
          supabase.from("properties").select("id, name").order("name"),
        ]);
        if (error) throw error;
        if (!cancelled) {
          setTicket(t as TicketRow);
          setProperties(props || []);
        }
      } catch (e: any) {
        toast.error("Erro ao carregar ticket: " + e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, ticketId]);

  const handleSave = async () => {
    if (!ticket) return;
    if (!ticket.subject.trim()) {
      toast.error("Informe o assunto");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("tickets")
        .update({
          subject: ticket.subject,
          description: ticket.description,
          priority: ticket.priority as any,
          status: ticket.status as any,
          property_id: ticket.property_id,
        })
        .eq("id", ticket.id);
      if (error) throw error;
      toast.success("Ticket atualizado");
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Erro ao salvar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar Ticket</DialogTitle>
        </DialogHeader>

        {loading || !ticket ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Assunto</Label>
              <Input
                value={ticket.subject}
                onChange={(e) => setTicket({ ...ticket, subject: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                rows={5}
                value={ticket.description || ""}
                onChange={(e) => setTicket({ ...ticket, description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <Select
                  value={ticket.priority}
                  onValueChange={(v) => setTicket({ ...ticket, priority: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={ticket.status}
                  onValueChange={(v) => setTicket({ ...ticket, status: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="novo">Novo</SelectItem>
                    <SelectItem value="em_analise">Em análise</SelectItem>
                    <SelectItem value="aguardando_info">Aguardando info</SelectItem>
                    <SelectItem value="em_execucao">Em execução</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Imóvel</Label>
              <Select
                value={ticket.property_id || "none"}
                onValueChange={(v) => setTicket({ ...ticket, property_id: v === "none" ? null : v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sem imóvel —</SelectItem>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
