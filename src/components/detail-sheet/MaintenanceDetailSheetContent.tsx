import { useRef, useState } from 'react';
import { useMaintenance } from '@/hooks/useMaintenances';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { uploadFileWithCompression, emParaleloOuFalha } from '@/lib/fileUpload';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { formatarBRL, formatarData, valorDevido } from '@/lib/cobrancaMeta';
import {
  Building2,
  User,
  Calendar,
  Paperclip,
  ExternalLink,
  Plus,
  Loader2,
  ImageIcon,
  ClipboardCheck,
  Trash2,
  Wrench,
} from 'lucide-react';
import { CHARGE_CATEGORIES, rotuloResponsavelCusto, rotulosServico } from '@/constants/chargeCategories';
import { Etiqueta } from '@/components/painel/Etiqueta';
import { EtiquetaStatusCobranca } from '@/components/cobrancas/EtiquetaStatusCobranca';
import { EtiquetaStatusTicket } from '@/components/tickets/EtiquetasTicket';
import { ResumoValorCobranca } from '@/components/cobrancas/ResumoValorCobranca';
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

export function MaintenanceDetailSheetContent({ id, onOpenFull }: Props) {
  const { data: maintenance, isLoading, refetch } = useMaintenance(id);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string } | null>(null);
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
      <div className="space-y-4" aria-busy="true" aria-label="Carregando manutenção">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-7 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    );
  }

  if (!maintenance) {
    return (
      <EmptyState
        icon={<Wrench className="h-5 w-5" />}
        title="Manutenção não encontrada"
        description="Ela pode ter sido excluída ou você não tem acesso."
        className="py-8"
      />
    );
  }

  const isCharge = maintenance.source === 'charge';
  const totalPaid =
    maintenance.payments?.reduce((sum: number, p: any) => sum + p.amount_cents, 0) || 0;
  const total = maintenance.amount_cents || 0;
  const remaining = valorDevido(maintenance) - totalPaid;
  const servicos = rotulosServico(maintenance.service_type);
  const categoria = maintenance.category
    ? CHARGE_CATEGORIES[maintenance.category as keyof typeof CHARGE_CATEGORIES] || maintenance.category
    : null;

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
      // Até 3 arquivos ao mesmo tempo, gravando os dados do arquivo enviado.
      await emParaleloOuFalha(Array.from(files), async (original) => {
        const folder = isCharge ? `charges/${id}` : `tickets/${id}`;
        const { url, file } = await uploadFileWithCompression(original, 'attachments', folder);

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
      });
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

      {/* Status + categoria + tipo de serviço. O status vem da cobrança ou do ticket. */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {isCharge ? (
          <EtiquetaStatusCobranca status={maintenance.status} />
        ) : (
          <EtiquetaStatusTicket status={maintenance.status} />
        )}
        {categoria && <Etiqueta tom="neutral">{categoria}</Etiqueta>}
        {servicos.map((s) => (
          <Etiqueta key={s} tom="neutral">
            {s}
          </Etiqueta>
        ))}
      </div>

      {/* Título */}
      <h3 className="text-lg font-semibold leading-tight">{maintenance.title || 'Sem título'}</h3>

      {/* Imóvel + Proprietário + vencimento */}
      <div className="space-y-2">
        {maintenance.property?.name && (
          <div className="flex items-start gap-2 text-sm">
            <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
            <span>{maintenance.property.name}</span>
          </div>
        )}
        {maintenance.owner?.name && (
          <div className="flex items-start gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
            <span>{maintenance.owner.name}</span>
          </div>
        )}
        {maintenance.due_date && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" aria-hidden="true" />
            <span>Vence em {formatarData(maintenance.due_date, "dd 'de' MMM 'de' yyyy")}</span>
          </div>
        )}
      </div>

      {/* Valores (apenas se houver cobrança / valor) */}
      {total > 0 && (
        <div className="rounded-lg border border-border/70 bg-muted/30 p-3 space-y-1.5">
          <ResumoValorCobranca cobranca={maintenance} variante="compacto" />
          {totalPaid > 0 && (
            <div className="flex items-center justify-between text-sm border-t border-border/60 pt-1.5">
              <span className="text-muted-foreground">Pago</span>
              <span className="text-success tabular-nums">{formatarBRL(totalPaid)}</span>
            </div>
          )}
          {remaining > 0 && totalPaid > 0 && (
            <div className="flex items-center justify-between text-sm font-medium">
              <span>Restante</span>
              <span className="text-destructive tabular-nums">{formatarBRL(remaining)}</span>
            </div>
          )}
          {maintenance.cost_responsible && (
            <div className="text-xs text-muted-foreground pt-1">
              Responsável: {rotuloResponsavelCusto(maintenance.cost_responsible, maintenance.split_owner_percent)}
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

      {/* Anexos: galeria com upload inline. O nome do arquivo nunca aparece. */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Paperclip className="h-3 w-3" aria-hidden="true" />
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
            <ImageIcon className="h-6 w-6 opacity-50" aria-hidden="true" />
            <span className="text-xs">Clique para adicionar fotos, vídeos ou documentos</span>
          </button>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {allAttachments.map((att, idx) => (
                <div
                  key={att.id}
                  className={`relative group aspect-square rounded-md overflow-hidden border bg-muted hover:ring-2 hover:ring-primary/40 transition-all ${
                    att.from_inspection ? 'border-info/40 ring-1 ring-info/20' : ''
                  }`}
                  title={att.from_inspection ? 'Anexo vindo da vistoria' : 'Anexo'}
                >
                  {/* A miniatura já é um botão; nada de botão dentro de botão. */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <MediaThumbnail
                      src={att.file_url}
                      fileType={att.file_type}
                      fileName={att.file_name}
                      size="lg"
                      onClick={() => {
                        setGalleryIndex(idx);
                        setGalleryOpen(true);
                      }}
                    />
                  </div>
                  {att.from_inspection && (
                    <div className="absolute top-1 left-1 bg-info text-info-foreground rounded-full p-1 shadow-sm pointer-events-none z-10">
                      <ClipboardCheck className="h-3 w-3" aria-hidden="true" />
                    </div>
                  )}
                  {!att.from_inspection && (
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget({ id: att.id });
                      }}
                      className="absolute top-1 right-1 h-7 w-7 p-0 z-20 opacity-90 hover:opacity-100 shadow"
                      aria-label="Excluir anexo"
                      title="Excluir anexo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10 transition-colors pointer-events-none" />
                </div>
              ))}
            </div>
            {allAttachments.some((a) => a.from_inspection) && (
              <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
                <ClipboardCheck className="h-3 w-3 text-info" aria-hidden="true" />
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

      {/* Único caminho para a página completa (o cabeçalho do painel tem "Editar"). */}
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
        onDelete={async (item) => {
          const table = maintenance?.source === 'charge' ? 'charge_attachments' : 'ticket_attachments';
          const ok = await deleteAttachmentRow(table as any, item.id);
          if (ok) {
            await queryClient.invalidateQueries({ queryKey: ['maintenance', id] });
            await refetch();
          }
        }}
      />

      <ConfirmationDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Excluir anexo?"
        description="Esta ação é permanente e não pode ser desfeita."
        confirmLabel="Excluir"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDeleteAttachment}
      />
    </div>
  );
}
