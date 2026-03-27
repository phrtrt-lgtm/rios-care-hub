import { Reservation, CalculatedReservation, ReportTotals, ReportData, ReportConfig } from './report-types';

export function calculateReservation(
  reservation: Reservation,
  commissionPercentage: number
): CalculatedReservation {
  const { reservation_value: VR, channel_commission: CC, cleaning_fee: TL } = reservation;
  const P = commissionPercentage / 100;
  const base = VR - CC;
  const managementCommission = base * P;
  const ownerNet = base * (1 - P);
  const cleaning = TL;
  const totalBase = base;
  const totalGeneral = VR - CC;

  return {
    ...reservation,
    base: roundCurrency(base),
    managementCommission: roundCurrency(managementCommission),
    ownerNet: roundCurrency(ownerNet),
    cleaning: roundCurrency(cleaning),
    totalBase: roundCurrency(totalBase),
    totalGeneral: roundCurrency(totalGeneral),
  };
}

export function calculateTotals(reservations: CalculatedReservation[]): ReportTotals {
  return {
    totalManagementCommission: roundCurrency(reservations.reduce((sum, r) => sum + r.managementCommission, 0)),
    totalOwnerNet: roundCurrency(reservations.reduce((sum, r) => sum + r.ownerNet, 0)),
    totalCleaning: roundCurrency(reservations.reduce((sum, r) => sum + r.cleaning, 0)),
    totalBase: roundCurrency(reservations.reduce((sum, r) => sum + r.totalBase, 0)),
    totalGeneral: roundCurrency(reservations.reduce((sum, r) => sum + r.totalGeneral, 0)),
    reservationCount: reservations.length,
  };
}

export function generateReport(
  config: ReportConfig,
  propertyCommissions?: Record<string, number>
): ReportData {
  const calculatedReservations = config.selectedReservations.map((r) => {
    const commission = propertyCommissions?.[r.property_name] ?? config.commissionPercentage;
    return calculateReservation(r, commission);
  });
  const totals = calculateTotals(calculatedReservations);
  return { config, reservations: calculatedReservations, totals, generatedAt: new Date() };
}

export function filterReservations(
  reservations: Reservation[],
  propertyName: string,
  startDate: Date | null,
  endDate: Date | null,
  useAllDates: boolean,
  includeCancelled: boolean = false
): Reservation[] {
  return reservations.filter((r) => {
    if (r.property_name !== propertyName) return false;
    if (!includeCancelled) {
      const normalizedStatus = r.status.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (!normalizedStatus.includes('confirm')) return false;
    }
    if (!useAllDates && startDate && endDate) {
      const checkin = new Date(r.checkin_date);
      checkin.setHours(0, 0, 0, 0);
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      if (checkin < start || checkin > end) return false;
    }
    return true;
  });
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatReportCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function formatReportDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(date));
}

export function getReportTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    management: 'Relatório da Gestão',
    management_cleaning: 'Gestão + Limpeza',
    owner: 'Relatório do Proprietário',
    owner_management: 'Proprietário + Gestão',
    owner_management_cleaning: 'Proprietário + Gestão + Limpeza',
  };
  return labels[type] || type;
}
