import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBRL } from '@/lib/format';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Building2,
  Calendar,
  Tag,
  ExternalLink,
  CreditCard,
  MessageSquare,
} from 'lucide-react';
import { CHARGE_CATEGORIES } from '@/constants/chargeCategories';

interface Props {
  id: string;
  onOpenFull: () => void;
}

interface ChargeData {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  service_type: string | null;
  amount_cents: number;
  management_contribution_cents: number;
  status: string;
  due_date: string | null;
  maintenance_date: string | null;
  payment_link_url: string | null;
  property: { id: string; name: string; cover_photo_url: string | null } | null;
  owner: { name: string; email: string; photo_url: string | null } | null;
  recent_messages: Array<{
    id: string;
    body: string;
    created_at: string;
    author_name: string | null;
  }>;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  draft: { label: 'Rascunho', className: 'bg-muted text-muted-foreground' },
  sent: { label: 'Enviada', className: 'bg-info/10 text-info border-info/30' },
  pending: { label: 'Pendente', className: 'bg-warning/10 text-warning border-warning/30' },
  pendente: { label: 'Pendente', className: 'bg-warning/10 text-warning border-warning/30' },
  paid: { label: 'Paga', className: 'bg-success/10 text-success border-success/30' },
  pago_no_vencimento: { label: 'Paga', className: 'bg-success/10 text-success border-success/30' },
  pago_antecipado: { label: 'Paga (antecipado)', className: 'bg-success/10 text-success border-success/30' },
  pago_com_atraso: { label: 'Paga (com atraso)', className: 'bg-success/10 text-success border-success/30' },
  overdue: { label: 'Vencida', className: 'bg-destructive/10 text-destructive border-destructive/30' },
  contested: { label: 'Contestada', className: 'bg-warning/10 text-warning border-warning/30' },
  debited: { label: 'Débito em Reserva', className: 'bg-destructive text-destructive-foreground' },
  aguardando_reserva: { label: 'Aguardando Reserva', className: 'bg-warning/10 text-warning border-warning/30' },
  cancelled: { label: 'Cancelada', className: 'bg-muted text-muted-foreground' },
};

export function CobrancaDetailSheetContent({ id, onOpenFull }: Props) {
  const [charge, setCharge] = useState<ChargeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data: chargeData, error } = await supabase
          .from('charges')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;

        const [ownerRes, propertyRes, messagesRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('name, email, photo_url')
            .eq('id', chargeData.owner_id)
            .single(),
          chargeData.property_id
            ? supabase
                .from('properties')
                .select('id, name, cover_photo_url')
                .eq('id', chargeData.property_id)
                .single()
            : Promise.resolve({ data: null }),
          supabase
            .from('charge_messages')
            .select('id, body, created_at, author_id')
            .eq('charge_id', id)
            .eq('is_internal', false)
            .order('created_at', { ascending: false })
            .limit(3),
        ]);

        // Fetch author names for recent messages
        const authorIds = Array.from(
          new Set((messagesRes.data || []).map((m: any) => m.author_id)),
        );
        const authorsMap = new Map<string, string>();
        if (authorIds.length > 0) {
          const { data: authors } = await supabase
            .from('profiles')
            .select('id, name')
            .in('id', authorIds);
          (authors || []).forEach((a) => authorsMap.set(a.id, a.name));
        }

        if (!cancelled) {
          setCharge({
            ...(chargeData as any),
            property: propertyRes.data,
            owner: ownerRes.data,
            recent_messages: (messagesRes.data || []).map((m: any) => ({
              id: m.id,
              body: m.body,
              created_at: m.created_at,
              author_name: authorsMap.get(m.author_id) || null,
            })),
          });
        }
      } catch (err) {
        console.error('Erro ao carregar cobrança:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!charge) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Cobrança não encontrada.
      </div>
    );
  }

  const statusInfo = STATUS_LABELS[charge.status] || {
    label: charge.status,
    className: 'bg-muted text-muted-foreground',
  };
  const ownerDue = charge.amount_cents - (charge.management_contribution_cents || 0);
  const isOverdue =
    charge.due_date &&
    new Date(charge.due_date) < new Date() &&
    !['paid', 'pago_no_vencimento', 'pago_antecipado', 'pago_com_atraso', 'cancelled'].includes(
      charge.status,
    );

  return (
    <div className="space-y-5">
      {/* Status + Categoria */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={statusInfo.className}>
          {statusInfo.label}
        </Badge>
        {charge.category && (
          <Badge variant="outline" className="text-xs">
            <Tag className="h-3 w-3 mr-1" />
            {CHARGE_CATEGORIES[charge.category as keyof typeof CHARGE_CATEGORIES] ||
              charge.category}
          </Badge>
        )}
      </div>

      {/* Título */}
      <div>
        <h3 className="text-lg font-semibold leading-tight">{charge.title}</h3>
      </div>

      {/* Imóvel */}
      {charge.property && (
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md overflow-hidden bg-muted shrink-0">
            {charge.property.cover_photo_url ? (
              <img
                src={charge.property.cover_photo_url}
                alt={charge.property.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
          </div>
          <span className="text-sm">{charge.property.name}</span>
        </div>
      )}

      {/* Proprietário */}
      {charge.owner && (
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={charge.owner.photo_url || undefined} alt={charge.owner.name} />
            <AvatarFallback className="text-xs">
              {charge.owner.name?.[0]?.toUpperCase() || '?'}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{charge.owner.name}</p>
            <p className="text-xs text-muted-foreground truncate">{charge.owner.email}</p>
          </div>
        </div>
      )}

      {/* Valores */}
      <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total</span>
          <span className="font-medium">{formatBRL(charge.amount_cents)}</span>
        </div>
        {charge.management_contribution_cents > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Aporte da gestão</span>
            <span className="text-success">
              - {formatBRL(charge.management_contribution_cents)}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm border-t pt-1.5">
          <span className="font-medium">Valor devido</span>
          <span className="font-semibold text-base">{formatBRL(ownerDue)}</span>
        </div>
      </div>

      {/* Datas */}
      {(charge.due_date || charge.maintenance_date) && (
        <div className="space-y-1 text-sm">
          {charge.due_date && (
            <div
              className={`flex items-center gap-2 ${
                isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'
              }`}
            >
              <Calendar className="h-4 w-4" />
              <span>
                Vence em{' '}
                {format(new Date(charge.due_date + 'T12:00:00'), "dd 'de' MMM 'de' yyyy", {
                  locale: ptBR,
                })}
                {isOverdue && ' (vencida)'}
              </span>
            </div>
          )}
          {charge.maintenance_date && (
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Calendar className="h-3 w-3" />
              <span>
                Manutenção:{' '}
                {format(
                  new Date(charge.maintenance_date + 'T12:00:00'),
                  "dd 'de' MMM 'de' yyyy",
                  { locale: ptBR },
                )}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Link de pagamento */}
      {charge.payment_link_url && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          asChild
          data-no-sheet
        >
          <a href={charge.payment_link_url} target="_blank" rel="noopener noreferrer">
            <CreditCard className="h-4 w-4 mr-2" />
            Abrir link de pagamento
          </a>
        </Button>
      )}

      {/* Descrição */}
      {charge.description && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Descrição</p>
          <p className="text-sm whitespace-pre-wrap">{charge.description}</p>
        </div>
      )}

      {/* Mensagens recentes */}
      {charge.recent_messages.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground">
              Mensagens recentes ({charge.recent_messages.length})
            </p>
          </div>
          <div className="space-y-2">
            {charge.recent_messages.map((msg) => (
              <div key={msg.id} className="rounded-md border bg-card p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">
                    {msg.author_name || 'Usuário'}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(msg.created_at), 'dd/MM HH:mm', { locale: ptBR })}
                  </span>
                </div>
                <p className="text-xs whitespace-pre-wrap line-clamp-3">{msg.body}</p>
              </div>
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
