import { useParams, useNavigate } from "react-router-dom";
import { goBack } from "@/lib/navigation";
import { useMaintenance } from "@/hooks/useMaintenances";
import { MaintenancePaymentForm } from "@/components/MaintenancePaymentForm";
import { MaintenanceUpdatesThread } from "@/components/MaintenanceUpdatesThread";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatBRL, formatDateTime, formatDate } from "@/lib/format";
import { ArrowLeft, Loader2, FileText, Calendar, DollarSign, Info, ClipboardCheck, Pencil } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { MediaThumbnail } from "@/components/MediaThumbnail";
import { MediaGallery } from "@/components/MediaGallery";
import { deleteAttachmentRow } from "@/lib/deleteAttachment";
import { DeleteAttachmentButton } from "@/components/DeleteAttachmentButton";
import { preloadMediaUrls } from "@/hooks/useMediaCache";
import { useState, useEffect } from "react";
import { EditMaintenanceDialog } from "@/components/EditMaintenanceDialog";
import { useQueryClient } from "@tanstack/react-query";

interface ManutencaoDetalhesProps {
  /** When provided, render without page chrome (for use inside a Dialog). */
  embedded?: boolean;
  /** Optional id override (when used in a Dialog without router params). */
  idOverride?: string;
}

export default function ManutencaoDetalhes({ embedded = false, idOverride }: ManutencaoDetalhesProps = {}) {
  const params = useParams();
  const id = idOverride ?? params.id;
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: maintenance, isLoading } = useMaintenance(id);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryStartIndex, setGalleryStartIndex] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const queryClient = useQueryClient();

  // Preload attachments when maintenance loads
  useEffect(() => {
    if (maintenance?.attachments && maintenance.attachments.length > 0) {
      const mediaUrls = maintenance.attachments
        .filter((a: any) => a.file_type?.startsWith('image/') || a.file_type?.startsWith('video/'))
        .map((a: any) => a.file_url)
        .filter(Boolean);
      if (mediaUrls.length > 0) {
        preloadMediaUrls(mediaUrls);
      }
    }
  }, [maintenance]);

  const wrapperClass = embedded
    ? "space-y-3"
    : "container mx-auto px-3 py-4 max-w-3xl space-y-3";

  if (isLoading) {
    return (
      <div className={wrapperClass}>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!maintenance) {
    return (
      <div className={wrapperClass}>
        <div className="text-center py-12 text-muted-foreground">Manutenção não encontrada</div>
      </div>
    );
  }

  const isTeam = profile?.role === 'admin' || profile?.role === 'agent' || profile?.role === 'maintenance';
  const totalPaid = maintenance.payments?.reduce((sum: number, p: any) => sum + p.amount_cents, 0) || 0;
  
  // Usar management_contribution_cents diretamente
  const total = maintenance.amount_cents || 0;
  const managementContribution = maintenance.management_contribution_cents || 0;
  const ownerDue = total - managementContribution;
  const remaining = ownerDue - totalPaid;
  
  // Calcular percentuais
  const managementPercent = total > 0 ? Math.round((managementContribution / total) * 100) : 0;
  const ownerPercent = 100 - managementPercent;

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      open: { variant: "secondary", label: "Aberta" },
      in_progress: { variant: "default", label: "Em andamento" },
      completed: { variant: "outline", label: "Concluída" },
      paid: { variant: "default", label: "Paga" },
      cancelled: { variant: "destructive", label: "Cancelada" },
    };
    const config = variants[status] || { variant: "secondary", label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getResponsibleLabel = () => {
    if (managementContribution === 0) return 'Proprietário (100%)';
    if (ownerDue === 0) return 'Gestão (100%)';
    return `Dividido - Proprietário: ${ownerPercent}% | Gestão: ${managementPercent}%`;
  };

  const hasFinancials = (maintenance.amount_cents || 0) > 0 || maintenance.source !== "ticket" || !!maintenance.charge_id;
  const ticketIdForUpdates: string | null =
    maintenance.source === "ticket" ? maintenance.id : maintenance.ticket_id ?? null;
  const chargeIdForUpdates: string | null =
    maintenance.source === "charge" ? maintenance.id : maintenance.charge_id ?? null;

  return (
    <div className={wrapperClass}>
      <div className="flex items-center gap-2">
        {!embedded && (
          <Button variant="ghost" size="icon" className="h-8 w-8 -ml-1" onClick={() => goBack(navigate, "/admin/manutencoes-lista")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold leading-tight truncate">{maintenance.title}</h1>
          <p className="text-muted-foreground text-xs">
            {formatDateTime(maintenance.created_at)}
          </p>
        </div>
        {isTeam && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditOpen(true)} title="Editar">
            <Pencil className="h-4 w-4" />
          </Button>
        )}
        {getStatusBadge(maintenance.status)}
      </div>

      {/* Informações principais */}
      <div className={hasFinancials ? "grid grid-cols-1 md:grid-cols-2 gap-3" : "grid grid-cols-1 gap-3"}>
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Detalhes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-2 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-muted-foreground">Imóvel</span>
              <span className="font-medium text-right">{maintenance.property?.name || '-'}</span>
            </div>

            {maintenance.category && (
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-muted-foreground">Categoria</span>
                <span className="font-medium text-right">{maintenance.category}</span>
              </div>
            )}

            {maintenance.description && (
              <div className="pt-1 border-t">
                <div className="text-xs text-muted-foreground mb-1">Descrição</div>
                <div className="text-sm whitespace-pre-wrap">{maintenance.description}</div>
              </div>
            )}

            {maintenance.due_date && (
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-muted-foreground">Vencimento</span>
                <span className="font-medium flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDate(maintenance.due_date)}
                </span>
              </div>
            )}

            {isTeam && (
              <div className="pt-1 border-t">
                <div className="text-xs text-muted-foreground">Proprietário</div>
                <div className="font-medium">{maintenance.owner?.name || '-'}</div>
                <div className="text-xs text-muted-foreground">{maintenance.owner?.email}</div>
              </div>
            )}
          </CardContent>
        </Card>

        {hasFinancials && (
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Financeiro
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-2 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-muted-foreground">Valor Total</span>
                <span className="font-semibold">{formatBRL(maintenance.amount_cents)}</span>
              </div>

              {managementContribution > 0 && (
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">Aporte Gestão</span>
                  <span className="font-semibold text-success">- {formatBRL(managementContribution)}</span>
                </div>
              )}

              <div className="flex items-baseline justify-between rounded-md bg-primary/5 px-2 py-1.5">
                <span className="text-xs font-medium text-muted-foreground">Devido</span>
                <span className="text-base font-bold text-primary">{formatBRL(ownerDue)}</span>
              </div>

              <div className="text-xs text-muted-foreground">
                {getResponsibleLabel()}
              </div>

              <Separator />

              <div className="flex items-baseline justify-between">
                <span className="text-xs text-muted-foreground">Pago</span>
                <span className="font-semibold text-success">{formatBRL(totalPaid)}</span>
              </div>

              <div className="flex items-baseline justify-between">
                <span className="text-xs text-muted-foreground">Restante</span>
                <span className="font-semibold text-warning">{formatBRL(remaining)}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>


      {/* Pagamentos (apenas quando há cobrança) */}
      {hasFinancials && (

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pagamentos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {maintenance.payments && maintenance.payments.length > 0 ? (
            <div className="space-y-2">
              {maintenance.payments.map((payment: any) => (
                <div key={payment.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">{formatBRL(payment.amount_cents)}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatDateTime(payment.payment_date)}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Método: </span>
                      <span>{payment.method || '-'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Aplica-se a: </span>
                      <span>{payment.applies_to}</span>
                    </div>
                  </div>
                  {payment.note && (
                    <div className="text-sm text-muted-foreground mt-2">{payment.note}</div>
                  )}
                  {payment.attachments && payment.attachments.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {payment.attachments.map((attachment: any) => (
                        <div key={attachment.id}>
                          <a
                            href={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/authenticated/maintenance-payment-proofs/${attachment.file_path}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline flex items-center gap-1"
                          >
                            <FileText className="h-3 w-3" />
                            {attachment.file_name}
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                  {payment.proof_file_url && (
                    <div className="mt-2">
                      <a
                        href={payment.proof_file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline"
                      >
                        Ver comprovante
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum pagamento registrado
            </div>
          )}

          {maintenance.status !== 'paid' && maintenance.status !== 'cancelled' && (
            <>
              <Separator />
              <div>
                <h3 className="font-medium mb-4">Registrar Novo Pagamento</h3>
                <MaintenancePaymentForm maintenanceId={maintenance.id} />
              </div>
            </>
          )}
        </CardContent>
      </Card>
      )}

      {/* Anexos */}
      {maintenance.attachments && maintenance.attachments.length > 0 && (
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Anexos ({maintenance.attachments.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            {(() => {
              const mediaAttachments = maintenance.attachments.filter(
                (a: any) => a.file_type?.startsWith('image/') || a.file_type?.startsWith('video/')
              );
              const otherAttachments = maintenance.attachments.filter(
                (a: any) => !a.file_type?.startsWith('image/') && !a.file_type?.startsWith('video/')
              );

              return (
                <div className="space-y-3">
                  {/* Mídia em linha horizontal compacta */}
                  {mediaAttachments.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
                      {mediaAttachments.map((attachment: any, idx: number) => (
                        <button
                          key={attachment.id}
                          className={`relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                            attachment.from_inspection ? 'ring-1 ring-info/30' : ''
                          }`}
                          title={attachment.from_inspection ? 'Anexo vindo da vistoria' : attachment.file_name}
                          onClick={() => {
                            setGalleryStartIndex(idx);
                            setGalleryOpen(true);
                          }}
                        >
                          <MediaThumbnail
                            src={attachment.file_url}
                            fileType={attachment.file_type}
                            fileName={attachment.file_name}
                            size="sm"
                            className="w-full h-full"
                          />
                          {attachment.from_inspection && (
                            <div className="absolute top-0.5 left-0.5 bg-info text-info-foreground rounded-full p-0.5 shadow-sm pointer-events-none">
                              <ClipboardCheck className="h-2.5 w-2.5" />
                            </div>
                          )}
                          {isTeam && (
                            <div className="absolute top-0.5 right-0.5 z-10 opacity-0 hover:opacity-100 transition-opacity">
                              <DeleteAttachmentButton
                                table={maintenance.source === 'charge' ? 'charge_attachments' : 'ticket_attachments' as any}
                                attachmentId={attachment.id}
                                fileName={attachment.file_name}
                                onDeleted={() => queryClient.invalidateQueries({ queryKey: ['maintenance', id] })}
                              />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {mediaAttachments.some((a: any) => a.from_inspection) && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <ClipboardCheck className="h-3 w-3 text-info" />
                      Anexos com ícone azul vieram da vistoria de origem
                    </p>
                  )}

                  {/* Arquivos — lista minimalista */}
                  {otherAttachments.length > 0 && (
                    <div className="space-y-0">
                      {otherAttachments.map((attachment: any) => (
                        <div
                          key={attachment.id}
                          className="flex items-center gap-3 py-2 border-b last:border-b-0"
                        >
                          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{attachment.file_name || 'Anexo'}</div>
                            <div className="text-xs text-muted-foreground">
                              {attachment.size_bytes ? `${(attachment.size_bytes / 1024).toFixed(1)} KB` : ''}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                              <a href={attachment.file_url} target="_blank" rel="noopener noreferrer">
                                Ver
                              </a>
                            </Button>
                            {isTeam && (
                              <DeleteAttachmentButton
                                table={maintenance.source === 'charge' ? 'charge_attachments' : 'ticket_attachments' as any}
                                attachmentId={attachment.id}
                                fileName={attachment.file_name}
                                onDeleted={() => queryClient.invalidateQueries({ queryKey: ['maintenance', id] })}
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <MediaGallery
                    items={mediaAttachments.map((a: any) => ({
                      id: a.id,
                      file_url: a.file_url,
                      file_name: a.file_name,
                      file_type: a.file_type,
                      size_bytes: a.size_bytes
                    }))}
                    initialIndex={galleryStartIndex}
                    open={galleryOpen}
                    onOpenChange={setGalleryOpen}
                    onDelete={isTeam ? async (item) => {
                      const ok = await deleteAttachmentRow("ticket_attachments", item.id);
                      if (ok) window.location.reload();
                    } : undefined}
                  />
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Acompanhamento (timeline da equipe → proprietário) */}
      <MaintenanceUpdatesThread
        ticketId={ticketIdForUpdates}
        chargeId={chargeIdForUpdates}
      />

      {/* Status da cobrança (apenas quando há cobrança) */}
      {hasFinancials && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Info className="h-4 w-4" />
              Informações da Cobrança
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Status: </span>
                {getStatusBadge(maintenance.status)}
              </div>
              {maintenance.paid_at && (
                <div>
                  <span className="text-muted-foreground">Pago em: </span>
                  <span>{formatDateTime(maintenance.paid_at)}</span>
                </div>
              )}
              {maintenance.contested_at && (
                <div>
                  <span className="text-muted-foreground">Contestado em: </span>
                  <span>{formatDateTime(maintenance.contested_at)}</span>
                </div>
              )}
              {maintenance.debited_at && (
                <div>
                  <span className="text-muted-foreground">Debitado em: </span>
                  <span>{formatDateTime(maintenance.debited_at)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {isTeam && (
        <EditMaintenanceDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          editId={maintenance.id}
          type={maintenance.source === "charge" ? "charge" : "maintenance"}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["maintenance", id] });
            queryClient.invalidateQueries({ queryKey: ["maintenances"] });
            queryClient.invalidateQueries({ queryKey: ["charges-list"] });
          }}
        />
      )}
    </div>
  );
}

