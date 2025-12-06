import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, DollarSign, Building2, AlertCircle, ChevronRight } from 'lucide-react';
import { format, differenceInDays, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface GuestChargePending {
  id: string;
  subject: string;
  guest_checkout_date: string;
  property_id: string;
  property_name: string;
  days_since_checkout: number;
  can_charge: boolean;
  days_until_charge: number;
}

export function GuestChargeReminders() {
  const navigate = useNavigate();
  const [pendingCharges, setPendingCharges] = useState<GuestChargePending[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGuestCharges();
  }, []);

  const fetchGuestCharges = async () => {
    try {
      // Fetch maintenance tickets with guest cost responsibility and checkout date
      const { data: tickets, error } = await supabase
        .from('tickets')
        .select(`
          id,
          subject,
          guest_checkout_date,
          property_id,
          properties!tickets_property_id_fkey(name)
        `)
        .eq('ticket_type', 'manutencao')
        .eq('cost_responsible', 'guest')
        .not('guest_checkout_date', 'is', null)
        .in('status', ['novo', 'em_analise', 'aguardando_info', 'em_execucao', 'concluido']);

      if (error) throw error;

      const today = new Date();
      const chargesWithDays: GuestChargePending[] = (tickets || [])
        .map(ticket => {
          const checkoutDate = new Date(ticket.guest_checkout_date!);
          const daysSince = differenceInDays(today, checkoutDate);
          const chargeDate = addDays(checkoutDate, 14);
          const daysUntil = differenceInDays(chargeDate, today);
          
          return {
            id: ticket.id,
            subject: ticket.subject,
            guest_checkout_date: ticket.guest_checkout_date!,
            property_id: ticket.property_id || '',
            property_name: (ticket.properties as any)?.name || 'Imóvel desconhecido',
            days_since_checkout: daysSince,
            can_charge: daysSince >= 14,
            days_until_charge: Math.max(0, daysUntil),
          };
        })
        // Sort: can charge first, then by days until charge
        .sort((a, b) => {
          if (a.can_charge && !b.can_charge) return -1;
          if (!a.can_charge && b.can_charge) return 1;
          return a.days_until_charge - b.days_until_charge;
        });

      setPendingCharges(chargesWithDays);
    } catch (error) {
      console.error('Error fetching guest charges:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return null;
  if (pendingCharges.length === 0) return null;

  const canChargeNow = pendingCharges.filter(c => c.can_charge);
  const upcoming = pendingCharges.filter(c => !c.can_charge);

  return (
    <Card className="border-orange-200 bg-orange-50/50 dark:bg-orange-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <DollarSign className="h-5 w-5 text-orange-600" />
          Cobranças de Hóspede Pendentes
          <Badge variant="secondary" className="ml-auto bg-orange-100 text-orange-700">
            {pendingCharges.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Can charge now */}
        {canChargeNow.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-green-700 dark:text-green-400 flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              Pronto para cobrar ({canChargeNow.length})
            </p>
            {canChargeNow.map(charge => (
              <div
                key={charge.id}
                className="flex items-center gap-3 p-3 bg-green-100/50 dark:bg-green-900/20 rounded-lg cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                onClick={() => navigate(`/ticket/${charge.id}`)}
              >
                <Building2 className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{charge.subject}</p>
                  <p className="text-xs text-muted-foreground">{charge.property_name}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <Badge variant="default" className="bg-green-600">
                    Cobrar agora
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-1">
                    Check-out: {format(new Date(charge.guest_checkout_date), 'dd/MM', { locale: ptBR })}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            ))}
          </div>
        )}

        {/* Upcoming */}
        {upcoming.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              Em breve ({upcoming.length})
            </p>
            {upcoming.slice(0, 3).map(charge => (
              <div
                key={charge.id}
                className="flex items-center gap-3 p-3 bg-background/50 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => navigate(`/ticket/${charge.id}`)}
              >
                <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{charge.subject}</p>
                  <p className="text-xs text-muted-foreground">{charge.property_name}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <Badge variant="outline">
                    {charge.days_until_charge} {charge.days_until_charge === 1 ? 'dia' : 'dias'}
                  </Badge>
                </div>
              </div>
            ))}
            {upcoming.length > 3 && (
              <p className="text-xs text-center text-muted-foreground">
                + {upcoming.length - 3} mais
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}