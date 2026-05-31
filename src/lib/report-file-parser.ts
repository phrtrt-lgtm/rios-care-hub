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
    let s = value.replace(/[R$€£\s]/g, '');
    if (!s) return 0;
    const hasComma = s.includes(',');
    const hasDot = s.includes('.');
    if (hasComma && hasDot) {
      // Decimal separator is the last occurring among '.' or ','
      const lastComma = s.lastIndexOf(',');
      const lastDot = s.lastIndexOf('.');
      if (lastComma > lastDot) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        s = s.replace(/,/g, '');
      }
    } else if (hasComma) {
      // Could be decimal (BR "931,86") or thousands ("1,234"). If exactly 3 digits after comma and no other sep, treat as thousands.
      const parts = s.split(',');
      if (parts.length === 2 && parts[1].length === 3 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
        s = parts.join('');
      } else {
        s = s.replace(',', '.');
      }
    }
    // Only dots OR no separators -> already valid float
    const parsed = parseFloat(s);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

// ============== Hostex format detection & parsing ==============
// Hostex exports CSV/XLSX with two header rows:
//   Row 1: section labels ("Reservations", "Renda Total", "Despesa Total", "Lucro Líquido Total")
//   Row 2: actual columns: Canal, Hóspede, Propriedade, Check-in, Check-out, Noites,
//          Hora da Reserva, Tarifa do quarto, Taxa de limpeza, Taxa para animais de estimação,
//          Taxa extra, Impostos, Comissão, Renda total, Despesa total, Lucro líquido
function isHostexHeader(row: unknown[]): boolean {
  if (!row) return false;
  const joined = row.map(c => normalizeColumnName(String(c ?? ''))).join('|');
  return joined.includes('tarifa do quarto') && joined.includes('comissao') && joined.includes('renda total');
}

function findIdx(headers: string[], ...needles: string[]): number {
  const normHeaders = headers.map(normalizeColumnName);
  for (const n of needles) {
    const nn = normalizeColumnName(n);
    const idx = normHeaders.findIndex(h => h === nn || h.includes(nn));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseHostex(rawData: unknown[][], headerRowIdx: number): ParsedFile {
  const headers = (rawData[headerRowIdx] as unknown[]).map(h => String(h ?? ''));
  const idx = {
    canal: findIdx(headers, 'canal'),
    hospede: findIdx(headers, 'hóspede', 'hospede'),
    propriedade: findIdx(headers, 'propriedade'),
    checkin: findIdx(headers, 'check-in', 'checkin'),
    checkout: findIdx(headers, 'check-out', 'checkout'),
    tarifa: findIdx(headers, 'tarifa do quarto'),
    limpeza: findIdx(headers, 'taxa de limpeza'),
    pets: findIdx(headers, 'taxa para animais'),
    extra: findIdx(headers, 'taxa extra'),
    impostos: findIdx(headers, 'impostos'),
    comissao: findIdx(headers, 'comissão', 'comissao'),
  };

  const reservations: Reservation[] = [];
  const properties = new Set<string>();
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  for (let i = headerRowIdx + 1; i < rawData.length; i++) {
    const row = rawData[i] as unknown[];
    if (!row || row.length === 0) continue;

    const property_name = idx.propriedade >= 0 ? String(row[idx.propriedade] ?? '').trim() : '';
    const checkin_date = idx.checkin >= 0 ? parseDate(row[idx.checkin]) : null;
    if (!property_name || !checkin_date) continue;

    const tarifa = idx.tarifa >= 0 ? parseNumber(row[idx.tarifa]) : 0;
    const pets = idx.pets >= 0 ? parseNumber(row[idx.pets]) : 0;
    const extra = idx.extra >= 0 ? parseNumber(row[idx.extra]) : 0;
    const impostos = idx.impostos >= 0 ? parseNumber(row[idx.impostos]) : 0;
    const comissao = idx.comissao >= 0 ? Math.abs(parseNumber(row[idx.comissao])) : 0;
    const cleaning = idx.limpeza >= 0 ? parseNumber(row[idx.limpeza]) : 0;

    const reservation_value = tarifa + pets + extra + impostos;
    const checkout_date = idx.checkout >= 0 ? (parseDate(row[idx.checkout]) || checkin_date) : checkin_date;

    const res: Reservation = {
      id: `hostex-${i}`,
      property_name,
      status: 'Confirmado',
      guest_name: idx.hospede >= 0 ? String(row[idx.hospede] ?? '') : '',
      checkin_date,
      checkout_date,
      reservation_value,
      channel_commission: comissao,
      cleaning_fee: cleaning,
      channel: idx.canal >= 0 ? String(row[idx.canal] ?? '') : undefined,
      selected: true,
    };

    reservations.push(res);
    properties.add(property_name);
    if (!minDate || checkin_date < minDate) minDate = checkin_date;
    if (!maxDate || checkin_date > maxDate) maxDate = checkin_date;
  }

  if (reservations.length === 0) throw new Error('Nenhuma reserva válida encontrada no arquivo Hostex');

  return {
    reservations,
    properties: Array.from(properties).sort(),
    dateRange: { min: minDate!, max: maxDate! },
  };
}

// ============== Hostex UNIFIED export (all properties in one CSV/XLSX) ==============
// Columns: Código, Código de reserva do canal, Hóspede, Telefone, Email, Canal,
// Número de hóspedes, Propriedade, Quarto original, Check-in, Check-out, Status,
// Tags, Observações, Tarifas, Detalhes, Comissão, Tarifa líquida, Atrasos,
// Outras rendas, Despesa, Moeda, Hora da Reserva, Operador, ...
// "Detalhes" is a multi-line cell with breakdown:
//   "Receita de quarto:R$ 425\nComissão:R$ 113.83\nTaxa de limpeza:R$ 200\n..."
function isHostexUnifiedHeader(row: unknown[]): boolean {
  if (!row) return false;
  const joined = row.map(c => normalizeColumnName(String(c ?? ''))).join('|');
  return joined.includes('propriedade')
    && joined.includes('tarifas')
    && joined.includes('detalhes')
    && joined.includes('tarifa liquida');
}

function parseDetalhes(s: string): Record<string, number> {
  const out: Record<string, number> = {};
  if (!s) return out;
  const lines = String(s).split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([^:]+):\s*R\$?\s*([-\d.,]+)/i);
    if (m) {
      const key = normalizeColumnName(m[1]);
      out[key] = parseNumber(m[2]);
    }
  }
  return out;
}

function parseHostexUnified(rawData: unknown[][], headerRowIdx: number): ParsedFile {
  const headers = (rawData[headerRowIdx] as unknown[]).map(h => String(h ?? ''));
  const idx = {
    canal: findIdx(headers, 'canal'),
    hospede: findIdx(headers, 'hóspede', 'hospede'),
    propriedade: findIdx(headers, 'propriedade'),
    checkin: findIdx(headers, 'check-in', 'checkin'),
    checkout: findIdx(headers, 'check-out', 'checkout'),
    status: findIdx(headers, 'status'),
    tarifas: findIdx(headers, 'tarifas'),
    detalhes: findIdx(headers, 'detalhes'),
    comissao: findIdx(headers, 'comissão', 'comissao'),
    liquida: findIdx(headers, 'tarifa líquida', 'tarifa liquida'),
  };

  const reservations: Reservation[] = [];
  const properties = new Set<string>();
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  for (let i = headerRowIdx + 1; i < rawData.length; i++) {
    const row = rawData[i] as unknown[];
    if (!row || row.length === 0) continue;
    const property_name = idx.propriedade >= 0 ? String(row[idx.propriedade] ?? '').trim() : '';
    const checkin_date = idx.checkin >= 0 ? parseDate(row[idx.checkin]) : null;
    if (!property_name || !checkin_date) continue;

    const det = idx.detalhes >= 0 ? parseDetalhes(String(row[idx.detalhes] ?? '')) : {};
    const quarto = det['receita de quarto'] ?? 0;
    const pets = det['taxa de animal de estimacao'] ?? det['taxa para animais de estimacao'] ?? 0;
    const extra = det['taxa de hospede extra'] ?? det['taxa extra'] ?? 0;
    const impostos = det['impostos'] ?? 0;
    const limpezaDet = det['taxa de limpeza'] ?? 0;

    // Channel commission: prefer the column (absolute) to keep parity with per-property Hostex parser
    const comissao = idx.comissao >= 0
      ? Math.abs(parseNumber(row[idx.comissao]))
      : Math.abs(det['comissao'] ?? 0);

    // If "Detalhes" is empty (some exports), fall back to "Tarifas" total minus cleaning estimate (best effort)
    const reservation_value = (quarto + pets + extra + impostos) || (idx.tarifas >= 0 ? Math.max(0, parseNumber(row[idx.tarifas]) - limpezaDet) : 0);
    const cleaning = limpezaDet;

    const rawStatus = idx.status >= 0 ? String(row[idx.status] ?? '').trim() : '';
    const normStatus = normalizeColumnName(rawStatus);
    const status = normStatus.startsWith('cancel') ? 'Cancelado' : 'Confirmado';

    const checkout_date = idx.checkout >= 0 ? (parseDate(row[idx.checkout]) || checkin_date) : checkin_date;

    reservations.push({
      id: `hostex-u-${i}`,
      property_name,
      status,
      guest_name: idx.hospede >= 0 ? String(row[idx.hospede] ?? '').trim() : '',
      checkin_date,
      checkout_date,
      reservation_value,
      channel_commission: comissao,
      cleaning_fee: cleaning,
      channel: idx.canal >= 0 ? String(row[idx.canal] ?? '').trim() : undefined,
      selected: true,
    });
    properties.add(property_name);
    if (!minDate || checkin_date < minDate) minDate = checkin_date;
    if (!maxDate || checkin_date > maxDate) maxDate = checkin_date;
  }

  if (reservations.length === 0) throw new Error('Nenhuma reserva válida encontrada no arquivo Hostex unificado');

  return {
    reservations,
    properties: Array.from(properties).sort(),
    dateRange: { min: minDate!, max: maxDate! },
  };
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
        const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];

        if (rawData.length < 2) throw new Error('Arquivo vazio ou sem dados suficientes');

        // Detect Hostex unified (all properties in one file)
        const unifiedIdx = rawData.slice(0, 5).findIndex(isHostexUnifiedHeader);
        if (unifiedIdx >= 0) {
          resolve(parseHostexUnified(rawData, unifiedIdx));
          return;
        }

        // Detect Hostex per-property (two-row header)
        const hostexHeaderIdx = rawData.slice(0, 5).findIndex(isHostexHeader);
        if (hostexHeaderIdx >= 0) {
          resolve(parseHostex(rawData, hostexHeaderIdx));
          return;
        }

        // Fallback: legacy TalkGuest format (single header row at row 0)
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
