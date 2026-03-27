// Core data types for Rios Relatórios

export interface Reservation {
  id: string;
  property_name: string;
  status: string;
  guest_name: string;
  checkin_date: Date;
  checkout_date: Date;
  reservation_value: number;
  channel_commission: number;
  cleaning_fee: number;
  channel?: string;
  selected?: boolean;
}

export interface ParsedFile {
  reservations: Reservation[];
  properties: string[];
  dateRange: {
    min: Date;
    max: Date;
  };
}

export type ReportType = 
  | 'management'
  | 'management_cleaning'
  | 'owner'
  | 'owner_management'
  | 'owner_management_cleaning';

export interface ReportConfig {
  propertyName: string;
  startDate: Date | null;
  endDate: Date | null;
  useAllDates: boolean;
  commissionPercentage: number;
  reportType: ReportType;
  selectedReservations: Reservation[];
}

export interface CalculatedReservation extends Reservation {
  base: number;
  managementCommission: number;
  ownerNet: number;
  cleaning: number;
  totalBase: number;
  totalGeneral: number;
}

export interface ReportTotals {
  totalManagementCommission: number;
  totalOwnerNet: number;
  totalCleaning: number;
  totalBase: number;
  totalGeneral: number;
  reservationCount: number;
}

export interface ReportData {
  config: ReportConfig;
  reservations: CalculatedReservation[];
  totals: ReportTotals;
  generatedAt: Date;
}
