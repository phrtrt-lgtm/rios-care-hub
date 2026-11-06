// Código comum entre hostex-sync e hostex-webhook: chamada à API da Hostex e
// conversão de uma reserva da Hostex na linha de public.hostex_reservations.

export const HOSTEX_BASE = "https://api.hostex.io/v3";

/** A Hostex responde HTTP 200 com o erro no corpo; isto vira erro de verdade. */
export function conferirRespostaHostex(json: any, path: string) {
  const code = json?.error_code;
  if (typeof code === "number" && code !== 200 && code !== 0) {
    throw new Error(`hostex_api_${code} em ${path}: ${String(json?.error_msg ?? "sem mensagem").slice(0, 200)}`);
  }
  return json;
}

export function toMoneyCents(v: any): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export async function hostexGet(path: string, params: Record<string, any>, apiKey: string) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    usp.append(k, String(v));
  }
  const resp = await fetch(`${HOSTEX_BASE}${path}?${usp.toString()}`, {
    headers: { "Hostex-Access-Token": apiKey, "Content-Type": "application/json", Accept: "application/json" },
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`hostex_${resp.status}: ${txt.slice(0, 300)}`);
  }
  return conferirRespostaHostex(await resp.json(), path);
}

export function extractList(payload: any, key: string): any[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload[key])) return payload[key];
  if (payload.data && Array.isArray(payload.data[key])) return payload.data[key];
  if (payload.data && Array.isArray(payload.data)) return payload.data;
  return [];
}

export const codigoDaReserva = (r: any) => String(r?.reservation_code ?? r?.code ?? r?.id ?? r?.uid ?? "");

/** Reserva da Hostex -> linha de hostex_reservations (mesmo formato da sincronização). */
export function linhaReserva(r: any, propertyIdDe: (hxPid: string) => string | null) {
  const hxPid = String(r.property_id ?? r.listing_id ?? "");
  const totalRate = r.rates?.total_rate?.amount ?? r.total_rate?.amount;
  const totalComm = r.rates?.total_commission?.amount ?? r.total_commission?.amount;
  return {
    reservation_code: codigoDaReserva(r),
    property_id_hostex: hxPid || null,
    property_id: hxPid ? propertyIdDe(hxPid) : null,
    property_name: r.property_name ?? null,
    channel_type: r.channel_type ?? r.channel ?? null,
    check_in_date: r.check_in_date ?? r.check_in ?? r.checkin_date,
    check_out_date: r.check_out_date ?? r.check_out ?? r.checkout_date,
    guests: r.number_of_guests ?? r.guests ?? null,
    status: r.status ?? "confirmed",
    stay_status: r.stay_status ?? null,
    guest_name: r.guest_name ?? null,
    booked_at: r.booked_at ?? null,
    total_rate_cents: toMoneyCents(totalRate),
    total_commission_cents: toMoneyCents(totalComm),
    currency: r.rates?.total_rate?.currency ?? r.currency ?? "BRL",
    raw: r,
    synced_at: new Date().toISOString(),
  };
}

/**
 * POST na API da Hostex (escrita: disponibilidade, reserva direta, preço).
 * HTTP fora de 2xx vira erro com o corpo; erro dentro do JSON passa por
 * `conferirRespostaHostex`. Timeout de 15 s: a Hostex é assíncrona e responde
 * rápido mesmo quando a propagação aos canais demora.
 */
export async function hostexPost(path: string, body: Record<string, unknown>, apiKey: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const resp = await fetch(`${HOSTEX_BASE}${path}`, {
      method: "POST",
      headers: { "Hostex-Access-Token": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const txt = await resp.text();
    let json: any = null;
    try { json = JSON.parse(txt); } catch { /* corpo não é JSON */ }
    if (!resp.ok) {
      throw new Error(`hostex_${resp.status} POST ${path}: ${String(json?.error_msg ?? txt).slice(0, 300)}`);
    }
    return conferirRespostaHostex(json, path);
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------------------
// Bloqueio de limpeza (_shared/limpeza): escrita por lista de datas, leitura do
// calendário mestre e das reservas accepted de um imóvel. Os chamadores
// antigos de /availabilities (por start_date/end_date) não passam por aqui.

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const maisDias = (data: string, dias: number) => {
  const [a, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
};

/**
 * Fecha (`available = false`) ou reabre noites de UM imóvel por lista de datas.
 * Nunca manda start_date/end_date: com os dois presentes a Hostex ignora
 * `dates`. A resposta só confirma que a tarefa foi aceita: a mudança é
 * assíncrona, confira depois com `hostexDisponibilidade`.
 */
export async function hostexMudarDatas(apiKey: string, propertyId: number, dates: string[], available: boolean) {
  if (!Number.isSafeInteger(propertyId) || propertyId <= 0) throw new Error("hostexMudarDatas: property_id inválido");
  const lista = [...new Set(dates)];
  if (lista.length === 0 || lista.some((d) => !DATA_ISO.test(d))) throw new Error("hostexMudarDatas: lista de datas inválida");
  return await hostexPost("/availabilities", { property_ids: [propertyId], dates: lista, available }, apiKey);
}

/** Calendário mestre de um imóvel entre duas datas (inclusivas): data -> available. */
export async function hostexDisponibilidade(apiKey: string, propertyId: number, de: string, ate: string) {
  const resp = await hostexGet("/availabilities", { property_ids: propertyId, start_date: de, end_date: ate }, apiKey);
  const imovel = ((resp?.data?.properties ?? []) as any[]).find((p) => Number(p?.id) === propertyId);
  const mapa = new Map<string, boolean>();
  for (const dia of imovel?.availabilities ?? []) {
    if (typeof dia?.date === "string" && typeof dia?.available === "boolean") mapa.set(dia.date, dia.available);
  }
  return mapa;
}

/**
 * Reservas `accepted` de um imóvel com check-out entre `de` e `ate`
 * (inclusivas). A API recusa janela de check-out acima de 180 dias
 * ("The check-out range cannot exceed 180 days."), então consulta em janelas.
 */
export async function hostexReservasAceitas(apiKey: string, propertyId: number, de: string, ate: string): Promise<any[]> {
  const JANELA = 180;
  const PAGINA = 100;
  const porCodigo = new Map<string, any>();
  let inicio = de;
  for (let janela = 0; janela < 12 && inicio <= ate; janela++) {
    const ultimo = maisDias(inicio, JANELA - 1);
    const fim = ultimo < ate ? ultimo : ate;
    for (let offset = 0; offset < 50 * PAGINA; offset += PAGINA) {
      const resp = await hostexGet("/reservations", {
        property_id: propertyId,
        status: "accepted",
        start_check_out_date: inicio,
        end_check_out_date: fim,
        order_by: "check_in_date",
        offset,
        limit: PAGINA,
      }, apiKey);
      const lista = extractList(resp, "reservations");
      for (const r of lista) porCodigo.set(`${codigoDaReserva(r)}|${r?.stay_code ?? ""}`, r);
      if (lista.length < PAGINA) break;
    }
    inicio = maisDias(fim, 1);
  }
  return [...porCodigo.values()];
}
