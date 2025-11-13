import { useParams, useNavigate } from "react-router-dom";
import { useMaintenance } from "@/hooks/useMaintenances";
import { MaintenancePaymentForm } from "@/components/MaintenancePaymentForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatBRL, formatDateTime, formatDate } from "@/lib/format";
import { ArrowLeft, Calendar, DollarSign, FileText, History } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function ManutencaoDetalhes() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: maintenance, isLoading } = useMaintenance(id);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">Carregando...</div>
      </div>
    );
  }

  if (!maintenance) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">Manutenção não encontrada</div>
      </div>
    );
  }

  const isTeam = profile?.role === 'admin' || profile?.role === 'agent';
  const totalPaid = maintenance.payments?.reduce((sum: number, p: any) => sum + p.amount_cents, 0) || 0;
  
  // Calcular quanto o proprietário deve baseado no cost_responsible
  const calculateOwnerDue = () => {
    const total = maintenance.amount_cents || 0;
    if (maintenance.cost_responsible === 'owner') return total;
    if (maintenance.cost_responsible === 'management') return 0;
    if (maintenance.cost_responsible === 'split') {
      const ownerPercent = maintenance.split_owner_percent || 50;
      return Math.round((total * ownerPercent) / 100);
    }
    return total;
  };
  
  // Calcular contribuição da gestão
  const calculateManagementContribution = () => {
    const total = maintenance.amount_cents || 0;
    if (maintenance.cost_responsible === 'owner') return 0;
    if (maintenance.cost_responsible === 'management') return total;
    if (maintenance.cost_responsible === 'split') {
      const managementPercent = 100 - (maintenance.split_owner_percent || 50);
      return Math.round((total * managementPercent) / 100);
    }
    return 0;
  };
  
  const ownerDue = calculateOwnerDue();
  const managementContribution = calculateManagementContribution();
  const remaining = ownerDue - totalPaid;

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

  const getResponsibleLabel = (responsible: string, percent?: number | null) => {
    if (responsible === 'owner') return 'Proprietário (100%)';
    if (responsible === 'management') return 'Gestão (100%)';
    if (responsible === 'split') return `Dividido - Proprietário: ${percent}% | Gestão: ${100 - (percent || 0)}%`;
    return responsible;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/manutencoes')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{maintenance.title}</h1>
          <p className="text-muted-foreground">
            Criado em {formatDateTime(maintenance.created_at)}
          </p>
        </div>
        {getStatusBadge(maintenance.status)}
      </div>

      {/* Informações principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                <div className="text-sm">{maintenance.description}</div>
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
                <div className="text-xl font-semibold text-green-600">- {formatBRL(managementContribution)}</div>
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
                {getResponsibleLabel(maintenance.cost_responsible, maintenance.split_owner_percent)}
              </div>
            </div>

            <Separator />

            <div>
              <div className="text-sm text-muted-foreground">Total Pago</div>
              <div className="text-xl font-semibold text-green-600">{formatBRL(totalPaid)}</div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground">Restante</div>
              <div className="text-xl font-semibold text-orange-600">{formatBRL(remaining)}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pagamentos */}
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

      {/* Anexos */}
      {maintenance.attachments && maintenance.attachments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Anexos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {maintenance.attachments.map((attachment: any) => (
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
          </CardContent>
        </Card>
      )}

      {/* Status da cobrança */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" />
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
    </div>
  );
}
