import type { HostexReservation, HostexProperty } from "./hostex";

const MS_DAY = 86_400_000;

function toDate(d: string): Date {
  return new Date(d.length <= 10 ? `${d}T00:00:00Z` : d);
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function nightsBetween(a: string, b: string): number {
  return Math.max(0, Math.round((toDate(b).getTime() - toDate(a).getTime()) / MS_DAY));
}
function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 5 || day === 6; // sex e sáb (noites de fim de semana)
}

export interface PropertyPricingInsight {
  property_id: string;
  property_name: string;
  vacant_nights_30d: number;
  vacant_weekend_nights_30d: number;
  total_nights_30d: number;
  occupancy_30d: number; // 0..1
  adr_next_30d: number;
  revenue_next_30d: number;
  longest_gap_nights: number;
  portfolio_avg_adr: number;
  adr_vs_portfolio_pct: number; // ex: +12 => 12% acima da média do portfólio
  suggested_discount_pct: number; // 0 = sem desconto; negativo = sugere aumento
  suggested_price: number; // adr * (1 - suggested_discount_pct/100)
  action: "subir_preco" | "manter" | "descontar_gap" | "preencher_curto";
  rationale: string;
}

export function pricingInsights30d(
  reservations: HostexReservation[],
  properties: Array<{ id: string; name: string }>,
  today: Date = new Date(),
): PropertyPricingInsight[] {
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const end = new Date(start.getTime() + 30 * MS_DAY);
  const startStr = ymd(start);
  const endStr = ymd(end);

  return properties.map((p) => {
    const res = reservations.filter(
      (r) =>
        String(r.property_id) === String(p.id) &&
        r.status !== "cancelled" &&
        r.check_out_date > startStr &&
        r.check_in_date < endStr,
    );

    // ocupação dia a dia
    const occupiedDays = new Set<string>();
    let revenue = 0;
    let booked = 0;
    for (const r of res) {
      const ci = new Date(Math.max(toDate(r.check_in_date).getTime(), start.getTime()));
      const co = new Date(Math.min(toDate(r.check_out_date).getTime(), end.getTime()));
      const nights = Math.max(0, Math.round((co.getTime() - ci.getTime()) / MS_DAY));
      booked += nights;
      const ratePerNight = (() => {
        const total = r.rates?.total_rate?.amount ?? 0;
        const fullNights = nightsBetween(r.check_in_date, r.check_out_date);
        return fullNights > 0 ? total / fullNights : 0;
      })();
      revenue += ratePerNight * nights;
      for (let t = ci.getTime(); t < co.getTime(); t += MS_DAY) {
        occupiedDays.add(ymd(new Date(t)));
      }
    }

    let vacant = 0;
    let vacantWk = 0;
    let longestGap = 0;
    let curGap = 0;
    for (let t = start.getTime(); t < end.getTime(); t += MS_DAY) {
      const d = new Date(t);
      const key = ymd(d);
      if (!occupiedDays.has(key)) {
        vacant++;
        if (isWeekend(d)) vacantWk++;
        curGap++;
        if (curGap > longestGap) longestGap = curGap;
      } else {
        curGap = 0;
      }
    }

    const totalNights = 30;
    const occupancy = booked / totalNights;
    const adr = booked > 0 ? revenue / booked : 0;

    let action: PropertyPricingInsight["action"];
    let rationale: string;
    if (occupancy >= 0.85) {
      action = "subir_preco";
      rationale = `Ocupação alta (${(occupancy * 100).toFixed(0)}%) nos próximos 30d. Considere reajustar diária para cima 5–10%.`;
    } else if (longestGap >= 5) {
      action = "descontar_gap";
      rationale = `Janela de ${longestGap} noites livres consecutivas. Aplicar desconto temporário (10–15%) ou min-stay 2 para preencher.`;
    } else if (vacantWk >= 4) {
      action = "preencher_curto";
      rationale = `${vacantWk} noites de fim de semana vagas. Ativar promoção last-minute ou bundle 2 noites.`;
    } else {
      action = "manter";
      rationale = `Ocupação saudável (${(occupancy * 100).toFixed(0)}%), sem gaps críticos. Manter preços.`;
    }

    return {
      property_id: String(p.id),
      property_name: p.name,
      vacant_nights_30d: vacant,
      vacant_weekend_nights_30d: vacantWk,
      total_nights_30d: totalNights,
      occupancy_30d: occupancy,
      adr_next_30d: adr,
      revenue_next_30d: revenue,
      longest_gap_nights: longestGap,
      action,
      rationale,
    };
  });
}

export function revenuePace30d(reservations: HostexReservation[], today: Date = new Date()) {
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const end = new Date(start.getTime() + 30 * MS_DAY);
  const days: Array<{ date: string; cumulative_revenue: number }> = [];
  let acc = 0;
  for (let t = start.getTime(); t < end.getTime(); t += MS_DAY) {
    const d = new Date(t);
    const dStr = ymd(d);
    let dayRev = 0;
    for (const r of reservations) {
      if (r.status === "cancelled") continue;
      if (r.check_in_date <= dStr && r.check_out_date > dStr) {
        const nights = nightsBetween(r.check_in_date, r.check_out_date);
        const rate = r.rates?.total_rate?.amount ?? 0;
        if (nights > 0) dayRev += rate / nights;
      }
    }
    acc += dayRev;
    days.push({ date: dStr, cumulative_revenue: acc });
  }
  return days;
}

export function weekendOccupancy30d(reservations: HostexReservation[], propertyCount: number, today: Date = new Date()) {
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const end = new Date(start.getTime() + 30 * MS_DAY);
  let weekendSlots = 0;
  let booked = 0;
  const occByPropDay = new Set<string>();
  for (const r of reservations) {
    if (r.status === "cancelled") continue;
    const ci = new Date(Math.max(toDate(r.check_in_date).getTime(), start.getTime()));
    const co = new Date(Math.min(toDate(r.check_out_date).getTime(), end.getTime()));
    for (let t = ci.getTime(); t < co.getTime(); t += MS_DAY) {
      occByPropDay.add(`${r.property_id}|${ymd(new Date(t))}`);
    }
  }
  for (let t = start.getTime(); t < end.getTime(); t += MS_DAY) {
    const d = new Date(t);
    if (!isWeekend(d)) continue;
    weekendSlots += propertyCount;
    for (let i = 0; i < propertyCount; i++) {
      // contagem genérica feita acima — booked é por reserva, abaixo refinamos
    }
  }
  // refinar booked
  for (const k of occByPropDay) {
    const dateStr = k.split("|")[1];
    const d = toDate(dateStr);
    if (isWeekend(d)) booked++;
  }
  return { weekend_slots: weekendSlots, weekend_booked: booked, rate: weekendSlots > 0 ? booked / weekendSlots : 0 };
}
