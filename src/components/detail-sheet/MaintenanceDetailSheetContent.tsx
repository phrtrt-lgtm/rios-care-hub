import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Building2, User, Calendar, Tag, Paperclip, ExternalLink, AlertCircle } from 'lucide-react';

interface Props {
  id: string;
  onOpenFull: () => void;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  novo: { label: 'Novo', className: 'bg-info/10 text-info border-info/30' },
  em_analise: { label: 'Em análise', className: 'bg-info/10 text-info border-info/30' },
  aguardando_info: { label: 'Aguardando info', className: 'bg-warning/10 text-warning border-warning/30' },
  em_execucao: { label: 'Em execução', className: 'bg-warning/10 text-warning border-warning/30' },
  concluido: { label: 'Concluído', className: 'bg-success/10 text-success border-success/30' },
  cancelado: { label: 'Cancelado', className: 'bg-muted text-muted-foreground' },
};

const COST_RESPONSIBLE_LABELS: Record<string, string> = {
  owner: 'Proprietário',
  pm: 'Gestão',
  management: 'Gestão',
  guest: 'Hóspede',
  pending: 'Em espera',
  split: 'Dividido',
};

const PRIORITY_LABELS: Record<string, { label: string; className: string }> = {
  normal: { label: 'Normal', className: 'bg-muted text-muted-foreground' },
  urgente: { label: 'Urgente', className: 'bg-destructive/10 text-destructive border-destructive/30' },
};

function useTicketDetail(id: string) {
  return useQuery({
    queryKey: ['ticket-sheet', id],
    queryFn: async () => {
      const { data: ticket, error } = await supabase
        .from('tickets')
        .select(`
          *,
          property:properties(id, name),
          owner:profiles!tickets_owner_id_fkey(id, name, email)
        `)
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!ticket) return null;

      const { data: attachments } = await supabase
        .from('ticket_attachments')
        .select('id, file_url, file_name, file_type, mime_type, name, size_bytes, created_at')
        .eq('ticket_id', id)
        .order('created_at', { ascending: false });

      return { ...ticket, attachments: attachments || [] } as any;
    },
    enabled: !!id,
  });
}

export function MaintenanceDetailSheetContent({ id, onOpenFull }: Props) {
  const { data: ticket, isLoading } = useTicketDetail(id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Manutenção não encontrada.
      </div>
    );
  }

  const statusInfo = STATUS_LABELS[ticket.status] || {
    label: ticket.status,
    className: 'bg-muted text-muted-foreground',
  };
  const priorityInfo = PRIORITY_LABELS[ticket.priority] || null;

  const mediaAttachments =
    ticket.attachments?.filter((a: any) => {
      const t = a.file_type || a.mime_type || '';
      return t.startsWith('image/') || t.startsWith('video/');
    }) || [];

  const otherAttachments =
    ticket.attachments?.filter((a: any) => {
      const t = a.file_type || a.mime_type || '';
      return !t.startsWith('image/') && !t.startsWith('video/');
    }) || [];

  return (
    <div className="space-y-5">
      {/* Status + Priority + Service type */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={statusInfo.className}>
          {statusInfo.label}
        </Badge>
        {priorityInfo && ticket.priority === 'urgente' && (
          <Badge variant="outline" className={priorityInfo.className}>
            <AlertCircle className="h-3 w-3 mr-1" />
            {priorityInfo.label}
          </Badge>
        )}
        {ticket.service_type && (
          <Badge variant="secondary" className="text-xs">
            <Tag className="h-3 w-3 mr-1" />
            {ticket.service_type}
          </Badge>
        )}
      </div>

      {/* Título */}
      <div>
        <h3 className="text-lg font-semibold leading-tight">
          {ticket.subject || 'Sem título'}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Criado em {format(new Date(ticket.created_at), "dd 'de' MMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
        </p>
      </div>

      {/* Imóvel + Proprietário */}
      <div className="space-y-2">
        {ticket.property?.name && (
          <div className="flex items-start gap-2 text-sm">
            <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <span>{ticket.property.name}</span>
          </div>
        )}
        {ticket.owner?.name && (
          <div className="flex items-start gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <span>{ticket.owner.name}</span>
          </div>
        )}
        {ticket.cost_responsible && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Tag className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Responsável pelo custo:{' '}
              <span className="text-foreground font-medium">
                {COST_RESPONSIBLE_LABELS[ticket.cost_responsible] || ticket.cost_responsible}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Datas */}
      {(ticket.scheduled_at || ticket.owner_action_due_at) && (
        <div className="space-y-1.5">
          {ticket.scheduled_at && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>
                Agendado para{' '}
                {format(new Date(ticket.scheduled_at), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
              </span>
            </div>
          )}
          {ticket.owner_action_due_at && ticket.status !== 'concluido' && (
            <div className="flex items-center gap-2 text-sm text-warning">
              <Calendar className="h-4 w-4" />
              <span>
                Decisão até{' '}
                {format(new Date(ticket.owner_action_due_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Descrição */}
      {ticket.description && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Descrição</p>
          <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
        </div>
      )}

      {/* Anexos de mídia */}
      {mediaAttachments.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <Paperclip className="h-3 w-3" />
            Anexos ({mediaAttachments.length})
          </p>
          <div className="grid grid-cols-3 gap-2">
            {mediaAttachments.slice(0, 6).map((att: any) => {
              const isVideo = (att.file_type || att.mime_type || '').startsWith('video/');
              return (
                <a
                  key={att.id}
                  href={att.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="aspect-square rounded-md overflow-hidden border bg-muted block relative"
                >
                  {isVideo ? (
                    <video
                      src={att.file_url}
                      className="w-full h-full object-cover"
                      preload="metadata"
                    />
                  ) : (
                    <img
                      src={att.file_url}
                      alt={att.name || att.file_name || 'Anexo'}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  )}
                </a>
              );
            })}
          </div>
          {mediaAttachments.length > 6 && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              +{mediaAttachments.length - 6} anexos
            </p>
          )}
        </div>
      )}

      {/* Outros anexos (PDF, etc.) */}
      {otherAttachments.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Paperclip className="h-3 w-3" />
            Documentos ({otherAttachments.length})
          </p>
          <div className="space-y-1">
            {otherAttachments.slice(0, 5).map((att: any) => (
              <a
                key={att.id}
                href={att.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm border rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors"
              >
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate flex-1">
                  {att.name || att.file_name || 'Documento'}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Botão final */}
      <div className="pt-2">
        <Button onClick={onOpenFull} className="w-full" variant="outline">
          <ExternalLink className="h-4 w-4 mr-2" />
          Ver página completa
        </Button>
      </div>
    </div>
  );
}
