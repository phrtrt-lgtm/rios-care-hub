import type { HostexReservation } from "./hostex";

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

export interface PropertyFinancialRow {
  property_id: string;
  property_name: string;
  reservations_count: number;
  booked_nights: number;
  total_nights: number;
  vacant_nights: number;
  occupancy: number;
  gross_revenue: number;
  channel_commission: number;
  net_after_channel: number;
  rios_commission_pct: number;
  rios_commission: number;
  owner_net: number;
  has_commission_config: boolean;
}

export interface FinancialTotals {
  reservations_count: number;
  booked_nights: number;
  total_nights: number;
  vacant_nights: number;
  occupancy: number;
  gross_revenue: number;
  channel_commission: number;
  net_after_channel: number;
  rios_commission: number;
  owner_net: number;
}

export function financialsByProperty(
  reservations: HostexReservation[],
  properties: Array<{ id: string; name: string }>,
  startDate: Date,
  endDate: Date,
  commissionByProperty: Map<string, number>,
): { rows: PropertyFinancialRow[]; totals: FinancialTotals } {
  const start = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));
  const startStr = ymd(start);
  const endStr = ymd(end);
  const totalNightsWindow = Math.max(0, Math.round((end.getTime() - start.getTime()) / MS_DAY));

  const rows: PropertyFinancialRow[] = properties.map((p) => {
    const res = reservations.filter(
      (r) =>
        String(r.property_id) === String(p.id) &&
        r.status !== "cancelled" &&
        r.check_out_date > startStr &&
        r.check_in_date < endStr,
    );

    let gross = 0;
    let channel = 0;
    let booked = 0;
    const occupied = new Set<string>();
    let reservationsInWindow = 0;

    for (const r of res) {
      const ci = new Date(Math.max(toDate(r.check_in_date).getTime(), start.getTime()));
      const co = new Date(Math.min(toDate(r.check_out_date).getTime(), end.getTime()));
      const nightsInWindow = Math.max(0, Math.round((co.getTime() - ci.getTime()) / MS_DAY));
      if (nightsInWindow <= 0) continue;
      reservationsInWindow++;
      booked += nightsInWindow;
      for (let t = ci.getTime(); t < co.getTime(); t += MS_DAY) occupied.add(ymd(new Date(t)));

      const totalRate = r.rates?.total_rate?.amount ?? 0;
      const totalCommission = r.rates?.total_commission?.amount ?? 0;
      const fullNights = nightsBetween(r.check_in_date, r.check_out_date);
      if (fullNights > 0) {
        const proportion = nightsInWindow / fullNights;
        gross += totalRate * proportion;
        channel += totalCommission * proportion;
      }
    }

    const netAfterChannel = gross - channel;
    const pct = commissionByProperty.get(String(p.id)) ?? 0;
    const rios = netAfterChannel * (pct / 100);
    const ownerNet = netAfterChannel - rios;
    const vacant = totalNightsWindow - booked;
    const occ = totalNightsWindow > 0 ? booked / totalNightsWindow : 0;

    return {
      property_id: String(p.id),
      property_name: p.name,
      reservations_count: reservationsInWindow,
      booked_nights: booked,
      total_nights: totalNightsWindow,
      vacant_nights: vacant,
      occupancy: occ,
      gross_revenue: gross,
      channel_commission: channel,
      net_after_channel: netAfterChannel,
      rios_commission_pct: pct,
      rios_commission: rios,
      owner_net: ownerNet,
      has_commission_config: pct > 0,
    };
  });

  const totals: FinancialTotals = rows.reduce(
    (acc, r) => {
      acc.reservations_count += r.reservations_count;
      acc.booked_nights += r.booked_nights;
      acc.total_nights += r.total_nights;
      acc.vacant_nights += r.vacant_nights;
      acc.gross_revenue += r.gross_revenue;
      acc.channel_commission += r.channel_commission;
      acc.net_after_channel += r.net_after_channel;
      acc.rios_commission += r.rios_commission;
      acc.owner_net += r.owner_net;
      return acc;
    },
    {
      reservations_count: 0,
      booked_nights: 0,
      total_nights: 0,
      vacant_nights: 0,
      occupancy: 0,
      gross_revenue: 0,
      channel_commission: 0,
      net_after_channel: 0,
      rios_commission: 0,
      owner_net: 0,
    },
  );
  totals.occupancy = totals.total_nights > 0 ? totals.booked_nights / totals.total_nights : 0;

  return { rows, totals };
}
