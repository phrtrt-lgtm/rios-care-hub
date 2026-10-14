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
