import { useRef, useState } from 'react';
import { useMaintenance } from '@/hooks/useMaintenances';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { uploadFileWithCompression } from '@/lib/fileUpload';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBRL } from '@/lib/format';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Building2,
  User,
  Calendar,
  Tag,
  Paperclip,
  ExternalLink,
  Plus,
  Loader2,
  Pencil,
  ImageIcon,
  ClipboardCheck,
  Trash2,
} from 'lucide-react';
import { CHARGE_CATEGORIES } from '@/constants/chargeCategories';
import { MediaThumbnail } from '@/components/MediaThumbnail';
import { MediaGallery } from '@/components/MediaGallery';
import { MaintenanceUpdatesThread } from '@/components/MaintenanceUpdatesThread';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { deleteAttachmentRow } from '@/lib/deleteAttachment';
import { toast } from 'sonner';

interface Props {
  id: string;
  onOpenFull: () => void;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  draft: { label: 'Rascunho', className: 'bg-muted text-muted-foreground' },
  sent: { label: 'Enviada', className: 'bg-info/10 text-info border-info/30' },
  pending: { label: 'Pendente', className: 'bg-warning/10 text-warning border-warning/30' },
  paid: { label: 'Paga', className: 'bg-success/10 text-success border-success/30' },
  pago_no_vencimento: { label: 'Paga', className: 'bg-success/10 text-success border-success/30' },
  pago_antecipado: { label: 'Paga (antecipado)', className: 'bg-success/10 text-success border-success/30' },
  pago_com_atraso: { label: 'Paga (com atraso)', className: 'bg-success/10 text-success border-success/30' },
  overdue: { label: 'Vencida', className: 'bg-destructive/10 text-destructive border-destructive/30' },
  debited: { label: 'Débito em Reserva', className: 'bg-destructive text-destructive-foreground' },
  cancelled: { label: 'Cancelada', className: 'bg-muted text-muted-foreground' },
  novo: { label: 'Novo', className: 'bg-info/10 text-info border-info/30' },
  em_analise: { label: 'Em análise', className: 'bg-warning/10 text-warning border-warning/30' },
  aguardando_info: { label: 'Aguardando info', className: 'bg-warning/10 text-warning border-warning/30' },
  em_execucao: { label: 'Em execução', className: 'bg-primary/10 text-primary border-primary/30' },
  concluido: { label: 'Concluído', className: 'bg-success/10 text-success border-success/30' },
};

const COST_RESPONSIBLE_LABELS: Record<string, string> = {
  owner: 'Proprietário',
  pm: 'Gestão',
  guest: 'Hóspede',
  management: 'Gestão',
  split: 'Dividido',
};

export function MaintenanceDetailSheetContent({ id, onOpenFull }: Props) {
  const { data: maintenance, isLoading, refetch } = useMaintenance(id);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name?: string | null } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAttachment = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const table = maintenance?.source === 'charge' ? 'charge_attachments' : 'ticket_attachments';
      const ok = await deleteAttachmentRow(table as any, deleteTarget.id);
      if (ok) {
        await queryClient.invalidateQueries({ queryKey: ['maintenance', id] });
        await refetch();
        setDeleteTarget(null);
      }
    } finally {
      setDeleting(false);
    }
  };

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

  if (!maintenance) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Manutenção não encontrada.
      </div>
    );
  }

  const statusInfo = STATUS_LABELS[maintenance.status] || {
    label: maintenance.status,
    className: 'bg-muted text-muted-foreground',
  };

  const isCharge = maintenance.source === 'charge';
  const totalPaid =
    maintenance.payments?.reduce((sum: number, p: any) => sum + p.amount_cents, 0) || 0;
  const total = maintenance.amount_cents || 0;
  const managementContribution = maintenance.management_contribution_cents || 0;
  const ownerDue = total - managementContribution;
  const remaining = ownerDue - totalPaid;

  const allAttachments: any[] = (maintenance.attachments || []).map((a: any) => ({
    id: a.id,
    file_url: a.file_url,
    file_name: a.file_name,
    file_type: a.file_type || a.mime_type,
    size_bytes: a.size_bytes ?? a.file_size ?? null,
    from_inspection: a.from_inspection ?? false,
    inspection_id: a.inspection_id ?? null,
  }));

  const handleUploadClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading) fileInputRef.current?.click();
  };

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const folder = isCharge ? `charges/${id}` : `tickets/${id}`;
        const { url } = await uploadFileWithCompression(file, 'attachments', folder, () => {});

        if (isCharge) {
          const { error } = await supabase.from('charge_attachments').insert({
            charge_id: id,
            file_path: url,
            file_name: file.name,
            mime_type: file.type,
            file_size: file.size,
            created_by: user.id,
          });
          if (error) throw error;
        } else {
          const { error } = await supabase.from('ticket_attachments' as any).insert({
            ticket_id: id,
            file_url: url,
            file_name: file.name,
            file_type: file.type,
            mime_type: file.type,
            file_size: file.size,
            uploaded_by: user.id,
          } as any);
          if (error) throw error;
        }
      }
      toast.success(files.length > 1 ? 'Anexos enviados!' : 'Anexo enviado!');
      await queryClient.invalidateQueries({ queryKey: ['maintenance', id] });
      await refetch();
    } catch (err: any) {
      console.error('[MaintenanceSheet upload]', err);
      toast.error('Erro ao enviar anexo');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-5">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFiles}
        className="hidden"
        multiple
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
      />

      {/* Status + Categoria */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={statusInfo.className}>
          {statusInfo.label}
        </Badge>
        {maintenance.category && (
          <Badge variant="outline" className="text-xs">
            <Tag className="h-3 w-3 mr-1" />
            {CHARGE_CATEGORIES[maintenance.category as keyof typeof CHARGE_CATEGORIES] ||
              maintenance.category}
          </Badge>
        )}
        {maintenance.service_type && (
          <Badge variant="secondary" className="text-xs">
            {maintenance.service_type}
          </Badge>
        )}
      </div>

      {/* Título */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-semibold leading-tight">
          {maintenance.title || 'Sem título'}
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground"
          onClick={onOpenFull}
          title="Editar / Ver completo"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Imóvel + Proprietário */}
      <div className="space-y-2">
        {maintenance.property?.name && (
          <div className="flex items-start gap-2 text-sm">
            <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <span>{maintenance.property.name}</span>
          </div>
        )}
        {maintenance.owner?.name && (
          <div className="flex items-start gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <span>{maintenance.owner.name}</span>
          </div>
        )}
        {(maintenance.due_date || maintenance.maintenance_date) && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            {maintenance.due_date && (
              <span>
                Vence em{' '}
                {format(
                  new Date(maintenance.due_date + 'T12:00:00'),
                  "dd 'de' MMM 'de' yyyy",
                  { locale: ptBR },
                )}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Valores (apenas se houver cobrança / valor) */}
      {total > 0 && (
        <div className="rounded-lg border bg-gradient-to-br from-muted/30 to-muted/10 p-3 space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-medium">{formatBRL(total)}</span>
          </div>
          {managementContribution > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Aporte da gestão</span>
              <span className="text-success">- {formatBRL(managementContribution)}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm border-t pt-1.5">
            <span className="text-muted-foreground">Devido pelo proprietário</span>
            <span className="font-semibold">{formatBRL(ownerDue)}</span>
          </div>
          {totalPaid > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Pago</span>
              <span className="text-success">{formatBRL(totalPaid)}</span>
            </div>
          )}
          {remaining > 0 && totalPaid > 0 && (
            <div className="flex items-center justify-between text-sm font-medium">
              <span>Restante</span>
              <span className="text-destructive">{formatBRL(remaining)}</span>
            </div>
          )}
          {maintenance.cost_responsible && (
            <div className="text-xs text-muted-foreground pt-1">
              Responsável:{' '}
              {COST_RESPONSIBLE_LABELS[maintenance.cost_responsible] ||
                maintenance.cost_responsible}
            </div>
          )}
        </div>
      )}

      {/* Descrição */}
      {maintenance.description && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Descrição</p>
          <p className="text-sm whitespace-pre-wrap">{maintenance.description}</p>
        </div>
      )}

      {/* Anexos — Galeria moderna com upload inline */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Paperclip className="h-3 w-3" />
            Anexos {allAttachments.length > 0 && `(${allAttachments.length})`}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={handleUploadClick}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Adicionar
          </Button>
        </div>

        {allAttachments.length === 0 ? (
          <button
            type="button"
            onClick={handleUploadClick}
            disabled={uploading}
            className="w-full rounded-lg border-2 border-dashed border-muted-foreground/20 hover:border-primary/40 hover:bg-muted/30 transition-colors py-6 flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ImageIcon className="h-6 w-6 opacity-50" />
            <span className="text-xs">Clique para adicionar fotos, vídeos ou documentos</span>
          </button>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {allAttachments.map((att, idx) => (
                <button
                  key={att.id}
                  type="button"
                  onClick={() => {
                    setGalleryIndex(idx);
                    setGalleryOpen(true);
                  }}
                  className={`aspect-square rounded-md overflow-hidden border bg-muted relative group hover:ring-2 hover:ring-primary/40 transition-all ${
                    att.from_inspection ? 'border-info/40 ring-1 ring-info/20' : ''
                  }`}
                  title={att.from_inspection ? 'Anexo vindo da vistoria' : att.file_name}
                >
                  <MediaThumbnail
                    src={att.file_url}
                    fileType={att.file_type}
                    fileName={att.file_name}
                    size="lg"
                  />
                  {att.from_inspection && (
                    <div className="absolute top-1 left-1 bg-info text-info-foreground rounded-full p-1 shadow-sm">
                      <ClipboardCheck className="h-3 w-3" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10 transition-colors" />
                </button>
              ))}
            </div>
            {allAttachments.some((a) => a.from_inspection) && (
              <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
                <ClipboardCheck className="h-3 w-3 text-info" />
                Anexos com este ícone vieram da vistoria de origem
              </p>
            )}
          </>
        )}
      </div>

      {/* Acompanhamento / Comentários da equipe */}
      <MaintenanceUpdatesThread
        ticketId={isCharge ? null : id}
        chargeId={isCharge ? id : maintenance.charge_id ?? null}
      />

      {/* Botão final */}
      <div className="pt-2">
        <Button onClick={onOpenFull} className="w-full" variant="outline">
          <ExternalLink className="h-4 w-4 mr-2" />
          Ver página completa
        </Button>
      </div>

      {/* Galeria fullscreen */}
      <MediaGallery
        items={allAttachments}
        initialIndex={galleryIndex}
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
      />
    </div>
  );
}
