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
    ? "space-y-6"
    : "container mx-auto p-6 space-y-6";

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
      <div className="flex items-center gap-4">
        {!embedded && (
          <Button variant="ghost" size="icon" onClick={() => goBack(navigate, "/admin/manutencoes-lista")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="flex-1">
          <h1 className={embedded ? "text-xl font-bold" : "text-3xl font-bold"}>{maintenance.title}</h1>
          <p className="text-muted-foreground text-sm">
            Criado em {formatDateTime(maintenance.created_at)}
          </p>
        </div>
        {getStatusBadge(maintenance.status)}
      </div>

      {/* Informações principais */}
      <div className={hasFinancials ? "grid grid-cols-1 md:grid-cols-2 gap-6" : "grid grid-cols-1 gap-6"}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Detalhes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-sm text-muted-foreground">Imóvel</div>
              <div className="font-medium">{maintenance.property?.name || '-'}</div>
            </div>

            {maintenance.category && (
              <div>
                <div className="text-sm text-muted-foreground">Categoria</div>
                <div className="font-medium">{maintenance.category}</div>
              </div>
            )}

            {maintenance.description && (
              <div>
                <div className="text-sm text-muted-foreground">Descrição</div>
                <div className="text-sm whitespace-pre-wrap">{maintenance.description}</div>
              </div>
            )}

            {maintenance.due_date && (
              <div>
                <div className="text-sm text-muted-foreground">Vencimento</div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span className="font-medium">{formatDate(maintenance.due_date)}</span>
                </div>
              </div>
            )}

            {isTeam && (
              <div>
                <div className="text-sm text-muted-foreground">Proprietário</div>
                <div className="font-medium">{maintenance.owner?.name || '-'}</div>
                <div className="text-xs text-muted-foreground">{maintenance.owner?.email}</div>
              </div>
            )}
          </CardContent>
        </Card>

        {hasFinancials && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Informações Financeiras
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="text-sm text-muted-foreground">Valor Total</div>
                <div className="text-2xl font-bold">{formatBRL(maintenance.amount_cents)}</div>
              </div>

              {managementContribution > 0 && (
                <div>
                  <div className="text-sm text-muted-foreground">Contribuição da Gestão</div>
                  <div className="text-xl font-semibold text-success">- {formatBRL(managementContribution)}</div>
                </div>
              )}

              <div>
                <div className="text-sm text-muted-foreground">Valor Devido (Proprietário)</div>
                <div className="text-2xl font-bold text-primary">
                  {formatBRL(ownerDue)}
                </div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground">Responsável pelo Custo</div>
                <div className="font-medium text-sm">
                  {getResponsibleLabel()}
                </div>
              </div>

              <Separator />

              <div>
                <div className="text-sm text-muted-foreground">Total Pago</div>
                <div className="text-xl font-semibold text-success">{formatBRL(totalPaid)}</div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground">Restante</div>
                <div className="text-xl font-semibold text-warning">{formatBRL(remaining)}</div>
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
          <CardHeader>
            <CardTitle className="text-base">Anexos</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const mediaAttachments = maintenance.attachments.filter(
                (a: any) => a.file_type?.startsWith('image/') || a.file_type?.startsWith('video/')
              );
              const otherAttachments = maintenance.attachments.filter(
                (a: any) => !a.file_type?.startsWith('image/') && !a.file_type?.startsWith('video/')
              );
              
              return (
                <div className="space-y-4">
                  {mediaAttachments.length > 0 && (
                    <>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                        {mediaAttachments.map((attachment: any, idx: number) => (
                          <div
                            key={attachment.id}
                            className={`relative ${
                              attachment.from_inspection ? 'ring-1 ring-info/30 rounded-md' : ''
                            }`}
                            title={attachment.from_inspection ? 'Anexo vindo da vistoria' : attachment.file_name}
                          >
                            <MediaThumbnail
                              src={attachment.file_url}
                              fileType={attachment.file_type}
                              fileName={attachment.file_name}
                              size="lg"
                              onClick={() => {
                                setGalleryStartIndex(idx);
                                setGalleryOpen(true);
                              }}
                            />
                            {attachment.from_inspection && (
                              <div className="absolute top-1 left-1 bg-info text-info-foreground rounded-full p-1 shadow-sm pointer-events-none z-10">
                                <ClipboardCheck className="h-3 w-3" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {mediaAttachments.some((a: any) => a.from_inspection) && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <ClipboardCheck className="h-3.5 w-3.5 text-info" />
                          Anexos com este ícone vieram da vistoria de origem desta manutenção
                        </p>
                      )}
                    </>
                  )}
                  {otherAttachments.length > 0 && (
                    <div className="space-y-2">
                      {otherAttachments.map((attachment: any) => (
                        <div key={attachment.id} className="flex items-center justify-between border rounded-lg p-3">
                          <div>
                            <div className="font-medium">{attachment.file_name || 'Anexo'}</div>
                            <div className="text-xs text-muted-foreground">
                              {attachment.size_bytes ? `${(attachment.size_bytes / 1024).toFixed(1)} KB` : ''}
                            </div>
                          </div>
                          <Button variant="outline" size="sm" asChild>
                            <a href={attachment.file_url} target="_blank" rel="noopener noreferrer">
                              Ver
                            </a>
                          </Button>
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
                      // detect ticket vs charge by table source isn't tracked here; try ticket then charge
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
    </div>
  );
}

