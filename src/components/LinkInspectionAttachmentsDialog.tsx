import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Wrench } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface Attachment {
  id: string;
  file_url: string;
  file_name?: string | null;
  file_type?: string | null;
  maintenance_ticket_id?: string | null;
}

interface Ticket {
  id: string;
  subject: string;
  created_at: string;
  status: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  inspectionCreatedAt: string;
  attachments: Attachment[];
  onLinked: () => void;
}

export function LinkInspectionAttachmentsDialog({
  open,
  onOpenChange,
  propertyId,
  inspectionCreatedAt,
  attachments,
  onLinked,
}: Props) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const pendingMedia = attachments.filter(
    (a) =>
      !a.maintenance_ticket_id &&
      (a.file_type?.startsWith('image/') || a.file_type?.startsWith('video/')),
  );

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoadingTickets(true);
      try {
        const { data, error } = await supabase
          .from('tickets')
          .select('id, subject, created_at, status')
          .eq('property_id', propertyId)
          .eq('type', 'manutencao')
          .gte('created_at', inspectionCreatedAt)
          .order('created_at', { ascending: false })
          .limit(20);
        if (error) throw error;
        setTickets(data || []);
      } catch (err) {
        console.error('Erro ao carregar manutenções:', err);
        toast.error('Erro ao carregar manutenções');
      } finally {
        setLoadingTickets(false);
      }
    };
    load();
    setSelectedIds(new Set(pendingMedia.map((a) => a.id)));
    setSelectedTicket('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, propertyId, inspectionCreatedAt]);

  const toggleAttachment = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedTicket) {
      toast.error('Selecione uma manutenção');
      return;
    }
    if (selectedIds.size === 0) {
      toast.error('Selecione ao menos um anexo');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('cleaning_inspection_attachments')
        .update({ maintenance_ticket_id: selectedTicket })
        .in('id', Array.from(selectedIds));
      if (error) throw error;
      toast.success(`${selectedIds.size} anexo(s) vinculado(s) à manutenção`);
      onLinked();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Erro ao vincular:', err);
      toast.error(err?.message || 'Erro ao vincular anexos');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            Vincular anexos a uma manutenção
          </DialogTitle>
          <DialogDescription>
            Marque os anexos que já viraram manutenção e selecione qual ticket eles
            pertencem. Eles passarão a exibir o badge "Já virou manutenção".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Lista de manutenções */}
          <div>
            <p className="text-sm font-medium mb-2">Manutenção</p>
            {loadingTickets ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 text-center border rounded-md">
                Nenhuma manutenção encontrada para este imóvel após a vistoria.
              </p>
            ) : (
              <ScrollArea className="h-40 border rounded-md">
                <div className="p-2 space-y-1">
                  {tickets.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTicket(t.id)}
                      className={`w-full text-left p-2 rounded-md transition-colors ${
                        selectedTicket === t.id
                          ? 'bg-primary/10 border border-primary/40'
                          : 'hover:bg-muted border border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate flex-1">
                          {t.subject}
                        </p>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {t.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(t.created_at), "dd 'de' MMM 'às' HH:mm", {
                          locale: ptBR,
                        })}
                      </p>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Lista de anexos pendentes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">
                Anexos pendentes ({pendingMedia.length})
              </p>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() =>
                  setSelectedIds(
                    selectedIds.size === pendingMedia.length
                      ? new Set()
                      : new Set(pendingMedia.map((a) => a.id)),
                  )
                }
              >
                {selectedIds.size === pendingMedia.length
                  ? 'Desmarcar todos'
                  : 'Marcar todos'}
              </button>
            </div>
            {pendingMedia.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 text-center border rounded-md">
                Não há anexos pendentes nesta vistoria.
              </p>
            ) : (
              <ScrollArea className="h-48 border rounded-md">
                <div className="grid grid-cols-4 gap-2 p-2">
                  {pendingMedia.map((att) => {
                    const isSelected = selectedIds.has(att.id);
                    return (
                      <button
                        key={att.id}
                        type="button"
                        onClick={() => toggleAttachment(att.id)}
                        className={`relative aspect-square rounded-md overflow-hidden border-2 transition-all ${
                          isSelected
                            ? 'border-primary ring-2 ring-primary/30'
                            : 'border-border hover:border-border/60'
                        }`}
                      >
                        {att.file_type?.startsWith('image/') ? (
                          <img
                            src={att.file_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-muted flex items-center justify-center text-xs">
                            Vídeo
                          </div>
                        )}
                        <div className="absolute top-1 right-1">
                          <Checkbox
                            checked={isSelected}
                            className="bg-background"
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !selectedTicket || selectedIds.size === 0}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Vincular {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
