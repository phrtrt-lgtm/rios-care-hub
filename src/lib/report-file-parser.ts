import * as XLSX from 'xlsx';
import { Reservation, ParsedFile } from './report-types';

const COLUMN_MAPPINGS: Record<string, keyof Reservation> = {
  'alojamento': 'property_name',
  'estado': 'status',
  'hospede': 'guest_name',
  'hóspede': 'guest_name',
  'checkin': 'checkin_date',
  'checkout': 'checkout_date',
  'valor reserva': 'reservation_value',
  'comissão canal': 'channel_commission',
  'taxa de limpeza': 'cleaning_fee',
  'canal': 'channel',
  'rental': 'property_name',
  'status': 'status',
  'guest': 'guest_name',
  'guest name': 'guest_name',
  'check-in': 'checkin_date',
  'check-out': 'checkout_date',
  'reservation value': 'reservation_value',
  'channel commission': 'channel_commission',
  'cleaning fee': 'cleaning_fee',
  'channel': 'channel',
  'propriedade': 'property_name',
  'imóvel': 'property_name',
  'imovel': 'property_name',
  'valor da reserva': 'reservation_value',
  'comissao canal': 'channel_commission',
  'limpeza': 'cleaning_fee',
  'taxa limpeza': 'cleaning_fee',
};

function normalizeColumnName(name: string): string {
  return name.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function mapColumnName(rawName: string): keyof Reservation | null {
  const normalized = normalizeColumnName(rawName);
  for (const [key, value] of Object.entries(COLUMN_MAPPINGS)) {
    const normalizedKey = normalizeColumnName(key);
    if (normalized === normalizedKey || normalized.includes(normalizedKey) || normalizedKey.includes(normalized)) {
      return value;
    }
  }
  return null;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) {
    if (value.getFullYear() > 1900) return value;
  }
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date && date.y > 1900) return new Date(date.y, date.m - 1, date.d);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const ddmmyyyyDash = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (ddmmyyyyDash) {
      const [, d, m, y] = ddmmyyyyDash.map(Number);
      if (y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) return new Date(y, m - 1, d);
    }
    const ddmmyyyySlash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmmyyyySlash) {
      const [, d, m, y] = ddmmyyyySlash.map(Number);
      if (y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) return new Date(y, m - 1, d);
    }
    const yyyymmdd = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (yyyymmdd) {
      const [, y, m, d] = yyyymmdd.map(Number);
      if (y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) return new Date(y, m - 1, d);
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900) return parsed;
  }
  return null;
}

function parseNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[R$€£\s]/g, '').replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

export async function parseReportFile(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

        if (rawData.length < 2) throw new Error('Arquivo vazio ou sem dados suficientes');

        const headers = (rawData[0] as string[]).map(h => ({
          original: h,
          mapped: mapColumnName(String(h || '')),
        }));

        const reservations: Reservation[] = [];
        const properties = new Set<string>();
        let minDate: Date | null = null;
        let maxDate: Date | null = null;

        for (let i = 1; i < rawData.length; i++) {
          const row = rawData[i] as unknown[];
          if (!row || row.length === 0) continue;
          const reservation: Partial<Reservation> = { id: `res-${i}`, selected: true };

          headers.forEach((header, index) => {
            if (header.mapped && row[index] !== undefined && row[index] !== null && row[index] !== '') {
              const value = row[index];
              switch (header.mapped) {
                case 'property_name':
                case 'status':
                case 'channel':
                case 'guest_name':
                  reservation[header.mapped] = String(value);
                  break;
                case 'checkin_date':
                case 'checkout_date': {
                  const date = parseDate(value);
                  if (date) reservation[header.mapped] = date;
                  break;
                }
                case 'reservation_value':
                case 'channel_commission':
                case 'cleaning_fee':
                  reservation[header.mapped] = parseNumber(value);
                  break;
              }
            }
          });

          if (reservation.property_name && reservation.checkin_date && reservation.reservation_value !== undefined) {
            const res = reservation as Reservation;
            res.status = res.status || 'Confirmado';
            res.guest_name = res.guest_name || '';
            res.checkout_date = res.checkout_date || res.checkin_date;
            res.channel_commission = res.channel_commission || 0;
            res.cleaning_fee = res.cleaning_fee || 0;
            reservations.push(res);
            properties.add(res.property_name);
            if (!minDate || res.checkin_date < minDate) minDate = res.checkin_date;
            if (!maxDate || res.checkin_date > maxDate) maxDate = res.checkin_date;
          }
        }

        if (reservations.length === 0) throw new Error('Nenhuma reserva válida encontrada no arquivo');

        resolve({
          reservations,
          properties: Array.from(properties).sort(),
          dateRange: { min: minDate!, max: maxDate! },
        });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.readAsArrayBuffer(file);
  });
}
