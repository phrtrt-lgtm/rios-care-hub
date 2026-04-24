import { useMaintenance } from '@/hooks/useMaintenances';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBRL } from '@/lib/format';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Building2, User, Calendar, Tag, Paperclip, ExternalLink } from 'lucide-react';
import { CHARGE_CATEGORIES } from '@/constants/chargeCategories';

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
};

const COST_RESPONSIBLE_LABELS: Record<string, string> = {
  owner: 'Proprietário',
  pm: 'Gestão',
  guest: 'Hóspede',
  management: 'Gestão',
  split: 'Dividido',
};

export function MaintenanceDetailSheetContent({ id, onOpenFull }: Props) {
  const { data: maintenance, isLoading } = useMaintenance(id);

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
  const totalPaid =
    maintenance.payments?.reduce((sum: number, p: any) => sum + p.amount_cents, 0) || 0;
  const total = maintenance.amount_cents || 0;
  const managementContribution = maintenance.management_contribution_cents || 0;
  const ownerDue = total - managementContribution;
  const remaining = ownerDue - totalPaid;

  const imageAttachments =
    maintenance.attachments?.filter((a: any) =>
      a.mime_type?.startsWith('image/'),
    ) || [];

  return (
    <div className="space-y-5">
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
      <div>
        <h3 className="text-lg font-semibold leading-tight">
          {maintenance.title || 'Sem título'}
        </h3>
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
      </div>

      {/* Valores */}
      <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
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

      {/* Datas */}
      {(maintenance.due_date || maintenance.maintenance_date) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          {maintenance.due_date && (
            <span>
              Vence em{' '}
              {format(new Date(maintenance.due_date + 'T12:00:00'), "dd 'de' MMM 'de' yyyy", {
                locale: ptBR,
              })}
            </span>
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

      {/* Anexos */}
      {imageAttachments.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <Paperclip className="h-3 w-3" />
            Anexos ({imageAttachments.length})
          </p>
          <div className="grid grid-cols-3 gap-2">
            {imageAttachments.slice(0, 6).map((att: any) => (
              <a
                key={att.id}
                href={att.file_url || att.file_path}
                target="_blank"
                rel="noopener noreferrer"
                className="aspect-square rounded-md overflow-hidden border bg-muted block"
              >
                <img
                  src={att.file_url || att.file_path}
                  alt={att.file_name || 'Anexo'}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
          {imageAttachments.length > 6 && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              +{imageAttachments.length - 6} anexos
            </p>
          )}
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
