import { useMemo } from 'react';
import { Reservation } from '@/lib/report-types';
import { formatReportCurrency, formatReportDate } from '@/lib/report-calculations';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';

interface ReportReservationsTableProps {
  reservations: Reservation[];
  onToggleReservation: (id: string) => void;
  onToggleAll: (selected: boolean) => void;
}

interface MonthGroup {
  key: string;
  label: string;
  reservations: Reservation[];
  totals: { reservationValue: number; channelCommission: number; cleaningFee: number };
}

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  const s = status.toLowerCase();
  if (s.includes('confirmad')) return 'default';
  if (s.includes('cancelad')) return 'destructive';
  if (s.includes('indisponível') || s.includes('indisponivel')) return 'secondary';
  return 'outline';
}

export function ReportReservationsTable({ reservations, onToggleReservation, onToggleAll }: ReportReservationsTableProps) {
  const allSelected = reservations.every((r) => r.selected);
  const someSelected = reservations.some((r) => r.selected) && !allSelected;

  const monthGroups = useMemo<MonthGroup[]>(() => {
    const groups = new Map<string, MonthGroup>();
    const sorted = [...reservations].sort((a, b) => new Date(b.checkin_date).getTime() - new Date(a.checkin_date).getTime());
    for (const reservation of sorted) {
      const date = new Date(reservation.checkin_date);
      const monthKey = format(date, 'yyyy-MM');
      const monthLabel = format(date, "MMMM 'de' yyyy", { locale: ptBR });
      if (!groups.has(monthKey)) {
        groups.set(monthKey, {
          key: monthKey,
          label: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
          reservations: [],
          totals: { reservationValue: 0, channelCommission: 0, cleaningFee: 0 },
        });
      }
      const group = groups.get(monthKey)!;
      group.reservations.push(reservation);
      group.totals.reservationValue += reservation.reservation_value;
      group.totals.channelCommission += reservation.channel_commission;
      group.totals.cleaningFee += reservation.cleaning_fee;
    }
    return Array.from(groups.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [reservations]);

  const grandTotals = useMemo(() => {
    return monthGroups.reduce((acc, group) => ({
      reservationValue: acc.reservationValue + group.totals.reservationValue,
      channelCommission: acc.channelCommission + group.totals.channelCommission,
      cleaningFee: acc.cleaningFee + group.totals.cleaningFee,
    }), { reservationValue: 0, channelCommission: 0, cleaningFee: 0 });
  }, [monthGroups]);

  return (
    <div className="space-y-4">
      {monthGroups.map((group) => (
        <div key={group.key} className="rounded-lg border border-border overflow-hidden">
          <div className="bg-primary/10 px-4 py-3 flex items-center justify-between">
            <h3 className="font-semibold text-foreground">{group.label}</h3>
            <span className="text-sm text-muted-foreground">{group.reservations.length} reserva{group.reservations.length !== 1 ? 's' : ''}</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-10">
                  <Checkbox
                    checked={group.reservations.every((r) => r.selected)}
                    onCheckedChange={(checked) => {
                      group.reservations.forEach((r) => { if (r.selected !== !!checked) onToggleReservation(r.id); });
                    }}
                  />
                </TableHead>
                <TableHead className="min-w-[140px]">Hóspede</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Check-out</TableHead>
                <TableHead className="text-right">Valor Reserva</TableHead>
                <TableHead className="text-right">Comissão Canal</TableHead>
                <TableHead className="text-right">Taxa Limpeza</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.reservations.map((reservation) => (
                <TableRow key={reservation.id} className={reservation.selected ? '' : 'opacity-50 bg-muted/10'}>
                  <TableCell><Checkbox checked={reservation.selected} onCheckedChange={() => onToggleReservation(reservation.id)} /></TableCell>
                  <TableCell className="font-medium">{reservation.guest_name || '-'}</TableCell>
                  <TableCell><Badge variant={getStatusVariant(reservation.status)}>{reservation.status}</Badge></TableCell>
                  <TableCell>{formatReportDate(reservation.checkin_date)}</TableCell>
                  <TableCell>{formatReportDate(reservation.checkout_date)}</TableCell>
                  <TableCell className="text-right font-medium">{formatReportCurrency(reservation.reservation_value)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatReportCurrency(reservation.channel_commission)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatReportCurrency(reservation.cleaning_fee)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/50 font-medium">
                <TableCell colSpan={5} className="text-right">Subtotal {group.label}:</TableCell>
                <TableCell className="text-right text-primary">{formatReportCurrency(group.totals.reservationValue)}</TableCell>
                <TableCell className="text-right">{formatReportCurrency(group.totals.channelCommission)}</TableCell>
                <TableCell className="text-right">{formatReportCurrency(group.totals.cleaningFee)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      ))}
      <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Checkbox checked={allSelected} onCheckedChange={(checked) => onToggleAll(!!checked)} {...(someSelected ? { 'data-state': 'indeterminate' } : {})} />
            <span className="font-semibold text-foreground">Total Geral ({reservations.length} reservas)</span>
          </div>
          <div className="flex gap-6 text-sm">
            <div className="text-right">
              <span className="text-muted-foreground">Valor Reserva:</span>
              <span className="ml-2 font-bold text-primary">{formatReportCurrency(grandTotals.reservationValue)}</span>
            </div>
            <div className="text-right">
              <span className="text-muted-foreground">Comissão Canal:</span>
              <span className="ml-2 font-medium">{formatReportCurrency(grandTotals.channelCommission)}</span>
            </div>
            <div className="text-right">
              <span className="text-muted-foreground">Taxa Limpeza:</span>
              <span className="ml-2 font-medium">{formatReportCurrency(grandTotals.cleaningFee)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
