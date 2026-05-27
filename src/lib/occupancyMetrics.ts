import type { HostexReservation } from "./hostex";

const MS_DAY = 24 * 60 * 60 * 1000;

function toDate(d: string): Date {
  // Aceita YYYY-MM-DD ou ISO
  return new Date(d.length <= 10 ? `${d}T00:00:00Z` : d);
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const a = toDate(checkIn).getTime();
  const b = toDate(checkOut).getTime();
  return Math.max(0, Math.round((b - a) / MS_DAY));
}

function clampNights(
  checkIn: string,
  checkOut: string,
  periodStart: string,
  periodEnd: string,
): number {
  const start = Math.max(toDate(checkIn).getTime(), toDate(periodStart).getTime());
  const end = Math.min(toDate(checkOut).getTime(), toDate(periodEnd).getTime());
  return Math.max(0, Math.round((end - start) / MS_DAY));
}

export interface OccupancyByProperty {
  property_id: string;
  nights_booked: number;
  nights_available: number;
  occupancy_rate: number; // 0..1
  revenue: number;
}

export function occupancyRate(
  reservations: HostexReservation[],
  propertyIds: string[],
  periodStart: string,
  periodEnd: string,
): { portfolio: OccupancyByProperty; byProperty: OccupancyByProperty[] } {
  const totalPeriodNights = nightsBetween(periodStart, periodEnd);
  const byId = new Map<string, OccupancyByProperty>();

  for (const pid of propertyIds) {
    byId.set(pid, {
      property_id: pid,
      nights_booked: 0,
      nights_available: totalPeriodNights,
      occupancy_rate: 0,
      revenue: 0,
    });
  }

  for (const r of reservations) {
    const pid = String(r.property_id);
    const entry = byId.get(pid);
    if (!entry) continue;
    const nights = clampNights(r.check_in_date, r.check_out_date, periodStart, periodEnd);
    entry.nights_booked += nights;
    entry.revenue += r.rates?.total_rate?.amount ?? 0;
  }

  let portfolioBooked = 0;
  let portfolioAvail = 0;
  let portfolioRevenue = 0;
  for (const e of byId.values()) {
    e.occupancy_rate = e.nights_available > 0 ? e.nights_booked / e.nights_available : 0;
    portfolioBooked += e.nights_booked;
    portfolioAvail += e.nights_available;
    portfolioRevenue += e.revenue;
  }

  return {
    portfolio: {
      property_id: "__portfolio__",
      nights_booked: portfolioBooked,
      nights_available: portfolioAvail,
      occupancy_rate: portfolioAvail > 0 ? portfolioBooked / portfolioAvail : 0,
      revenue: portfolioRevenue,
    },
    byProperty: [...byId.values()],
  };
}

export function revenueWeightedOccupancy(reservations: HostexReservation[]): number {
  // ADR proxy: receita média por noite (R$/noite) — usar como métrica de qualidade
  let totalRevenue = 0;
  let totalNights = 0;
  for (const r of reservations) {
    const nights = nightsBetween(r.check_in_date, r.check_out_date);
    totalRevenue += r.rates?.total_rate?.amount ?? 0;
    totalNights += nights;
  }
  return totalNights > 0 ? totalRevenue / totalNights : 0;
}

export interface CalendarGap {
  property_id: string;
  start: string; // YYYY-MM-DD
  end: string;
  days: number;
}

export function calendarGaps(
  reservations: HostexReservation[],
  periodStart: string,
  periodEnd: string,
): CalendarGap[] {
  const byProp = new Map<string, HostexReservation[]>();
  for (const r of reservations) {
    const pid = String(r.property_id);
    const arr = byProp.get(pid) ?? [];
    arr.push(r);
    byProp.set(pid, arr);
  }

  const gaps: CalendarGap[] = [];
  for (const [pid, list] of byProp) {
    const sorted = [...list].sort((a, b) => a.check_in_date.localeCompare(b.check_in_date));
    let cursor = periodStart;
    for (const r of sorted) {
      if (r.check_in_date > cursor) {
        const days = nightsBetween(cursor, r.check_in_date);
        if (days >= 1) gaps.push({ property_id: pid, start: cursor, end: r.check_in_date, days });
      }
      if (r.check_out_date > cursor) cursor = r.check_out_date;
    }
    if (cursor < periodEnd) {
      const days = nightsBetween(cursor, periodEnd);
      if (days >= 1) gaps.push({ property_id: pid, start: cursor, end: periodEnd, days });
    }
  }
  return gaps;
}

export function averageLeadTime(reservations: HostexReservation[]): number {
  const diffs: number[] = [];
  for (const r of reservations) {
    if (!r.booked_at) continue;
    const days = (toDate(r.check_in_date).getTime() - toDate(r.booked_at).getTime()) / MS_DAY;
    if (Number.isFinite(days) && days >= 0) diffs.push(days);
  }
  if (!diffs.length) return 0;
  return diffs.reduce((a, b) => a + b, 0) / diffs.length;
}

export function forecastRevenue(
  reservations: HostexReservation[],
  periodStart: string,
  periodEnd: string,
): number {
  let total = 0;
  for (const r of reservations) {
    if (r.check_out_date <= periodStart || r.check_in_date >= periodEnd) continue;
    total += r.rates?.total_rate?.amount ?? 0;
  }
  return total;
}

export function channelMix(reservations: HostexReservation[]): Array<{ channel: string; count: number; revenue: number }> {
  const map = new Map<string, { count: number; revenue: number }>();
  for (const r of reservations) {
    const ch = (r.channel_type || "—").toLowerCase();
    const entry = map.get(ch) ?? { count: 0, revenue: 0 };
    entry.count += 1;
    entry.revenue += r.rates?.total_rate?.amount ?? 0;
    map.set(ch, entry);
  }
  return [...map.entries()].map(([channel, v]) => ({ channel, ...v })).sort((a, b) => b.revenue - a.revenue);
}

export function adrByProperty(reservations: HostexReservation[]): Array<{ property_id: string; adr: number; revenue: number; nights: number }> {
  const map = new Map<string, { revenue: number; nights: number }>();
  for (const r of reservations) {
    const pid = String(r.property_id);
    const nights = nightsBetween(r.check_in_date, r.check_out_date);
    const entry = map.get(pid) ?? { revenue: 0, nights: 0 };
    entry.revenue += r.rates?.total_rate?.amount ?? 0;
    entry.nights += nights;
    map.set(pid, entry);
  }
  return [...map.entries()]
    .map(([property_id, v]) => ({
      property_id,
      revenue: v.revenue,
      nights: v.nights,
      adr: v.nights > 0 ? v.revenue / v.nights : 0,
    }))
    .sort((a, b) => b.adr - a.adr);
}
