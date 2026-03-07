import * as XLSX from "xlsx";

export interface ParsedReservation {
  property_name: string;
  guest_name: string;
  checkin_date: string;   // YYYY-MM-DD
  checkout_date: string;  // YYYY-MM-DD
  reservation_amount: number;  // R$ (não centavos)
  cleaning_fee: number;
  channel_commission: number;
  status: string;
  channel?: string;
}

export interface SpreadsheetResult {
  reservations: ParsedReservation[];
  propertyNames: string[];
}

// Normaliza string: lowercase, sem acentos, sem espaços extras
function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-\s]+/g, " ")
    .trim();
}

// Mapeamento de colunas normalizadas → campo interno
const COLUMN_MAP: Record<string, keyof ParsedReservation> = {
  "alojamento": "property_name",
  "rental": "property_name",
  "imovel": "property_name",
  "property": "property_name",
  "hospede": "guest_name",
  "guest": "guest_name",
  "nome hospede": "guest_name",
  "guest name": "guest_name",
  "estado": "status",
  "status": "status",
  "checkin": "checkin_date",
  "check in": "checkin_date",
  "check-in": "checkin_date",
  "data checkin": "checkin_date",
  "checkout": "checkout_date",
  "check out": "checkout_date",
  "check-out": "checkout_date",
  "data checkout": "checkout_date",
  "valor reserva": "reservation_amount",
  "reservation value": "reservation_amount",
  "valor da reserva": "reservation_amount",
  "total reserva": "reservation_amount",
  "comissao canal": "channel_commission",
  "channel commission": "channel_commission",
  "comissao": "channel_commission",
  "commission": "channel_commission",
  "taxa de limpeza": "cleaning_fee",
  "cleaning fee": "cleaning_fee",
  "taxa limpeza": "cleaning_fee",
  "canal": "channel",
  "channel": "channel",
};

// Parse de serial numérico do Excel para data
function excelSerialToDate(serial: number): string {
  // Excel usa 1900-01-01 como dia 1, mas tem o bug do ano bissexto 1900
  const utcDays = serial - 25569; // epoch offset
  const ms = utcDays * 86400 * 1000;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Parse de string de data nos formatos suportados
function parseDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";

  // Serial numérico do Excel
  if (typeof value === "number") {
    return excelSerialToDate(value);
  }

  const str = String(value).trim();

  // Já está em YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.substring(0, 10);
  }

  // DD-MM-YYYY ou DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m}-${d}`;
  }

  // Tentar Date nativo como fallback
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  return "";
}

// Parse de número removendo R$, pontos de milhar, convertendo vírgula decimal
function parseNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return value;

  const str = String(value)
    .trim()
    .replace(/R\$\s*/gi, "")
    .replace(/\s/g, "");

  // Detectar formato: se tem vírgula como decimal (1.234,56) ou ponto (1,234.56)
  // Heurística: último separador é o decimal
  const lastComma = str.lastIndexOf(",");
  const lastDot = str.lastIndexOf(".");

  let normalized = str;
  if (lastComma > lastDot) {
    // Formato BR: 1.234,56
    normalized = str.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    // Formato US: 1,234.56
    normalized = str.replace(/,/g, "");
  } else {
    // Sem separador decimal
    normalized = str.replace(/[,\.]/g, "");
  }

  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
}

export function parseSpreadsheet(file: File): Promise<SpreadsheetResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "array", cellDates: false });

        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          raw: true,
          defval: "",
        }) as unknown[][];

        if (rows.length < 2) {
          reject(new Error("Planilha vazia ou sem dados"));
          return;
        }

        // Encontrar linha de cabeçalho (primeira linha não vazia)
        let headerRowIndex = 0;
        for (let i = 0; i < Math.min(5, rows.length); i++) {
          const rowStr = rows[i].join("").trim();
          if (rowStr.length > 0) {
            headerRowIndex = i;
            break;
          }
        }

        const headerRow = rows[headerRowIndex] as string[];
        
        // Mapear índice de coluna → campo interno
        const colMapping: Record<number, keyof ParsedReservation> = {};
        headerRow.forEach((cell, idx) => {
          const norm = normalize(String(cell));
          const field = COLUMN_MAP[norm];
          if (field) {
            colMapping[idx] = field;
          }
        });

        const reservations: ParsedReservation[] = [];

        for (let i = headerRowIndex + 1; i < rows.length; i++) {
          const row = rows[i] as unknown[];
          if (!row || row.every((cell) => !cell || String(cell).trim() === "")) continue;

          const record: Partial<ParsedReservation> = {
            property_name: "",
            guest_name: "",
            checkin_date: "",
            checkout_date: "",
            reservation_amount: 0,
            cleaning_fee: 0,
            channel_commission: 0,
            status: "Confirmado",
            channel: "",
          };

          Object.entries(colMapping).forEach(([idxStr, field]) => {
            const idx = parseInt(idxStr);
            const rawValue = row[idx];

            if (field === "checkin_date" || field === "checkout_date") {
              (record as Record<string, unknown>)[field] = parseDate(rawValue);
            } else if (
              field === "reservation_amount" ||
              field === "cleaning_fee" ||
              field === "channel_commission"
            ) {
              (record as Record<string, unknown>)[field] = parseNumber(rawValue);
            } else {
              (record as Record<string, unknown>)[field] = String(rawValue || "").trim();
            }
          });

          // Pular linhas sem imóvel ou sem datas válidas
          if (!record.property_name || !record.checkin_date || !record.checkout_date) continue;

          reservations.push(record as ParsedReservation);
        }

        const propertyNames = [...new Set(reservations.map((r) => r.property_name))].filter(Boolean);

        resolve({ reservations, propertyNames });
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error("Erro ao ler o arquivo"));
    reader.readAsArrayBuffer(file);
  });
}
