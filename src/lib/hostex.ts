import { supabase } from "@/integrations/supabase/client";

export type HostexSource = "hostex" | "ical_fallback" | "error";

export interface HostexRate {
  total_rate?: { amount: number; currency?: string };
  total_commission?: { amount: number; currency?: string };
  details?: Array<{ type: string; amount: number }>;
}

export interface HostexReservation {
  reservation_code: string;
  property_id: string | number;
  property_name?: string | null;
  channel_type: string;
  check_in_date: string;
  check_out_date: string;
  number_of_guests?: number | null;
  status?: string;
  stay_status?: string | null;
  guest_name?: string | null;
  booked_at?: string | null;
  rates?: HostexRate | null;
}

export interface HostexProperty {
  id: string | number;
  name: string;
  address?: string | null;
  channels?: string[];
}

export interface HostexCalendarEntry {
  listing_id: string | number;
  start_date: string;
  end_date: string;
  status: string;
}

export interface HostexResponse<T> {
  source: HostexSource;
  reason?: string;
  cached?: boolean;
  data: T;
}

async function invoke<T>(action: string, params: Record<string, any> = {}): Promise<HostexResponse<T>> {
  const { data, error } = await supabase.functions.invoke("hostex-proxy", {
    body: { action, params },
  });
  if (error) {
    return { source: "error", reason: error.message, data: undefined as unknown as T };
  }
  return data as HostexResponse<T>;
}

function unwrapList<T>(payload: any, key: string): T[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload[key])) return payload[key];
  // Hostex frequentemente retorna { data: { reservations: [...] } }
  if (payload.data && Array.isArray(payload.data[key])) return payload.data[key];
  if (payload.data && Array.isArray(payload.data)) return payload.data;
  return [];
}

export const hostex = {
  async searchReservations(params: {
    start_date?: string;
    end_date?: string;
    property_id?: string | number;
    channel_type?: string;
    status?: string;
  } = {}) {
    const resp = await invoke<any>("search_reservations", params);
    return {
      source: resp.source,
      reason: resp.reason,
      reservations: unwrapList<HostexReservation>(resp.data, "reservations"),
    };
  },
  async searchProperties() {
    const resp = await invoke<any>("search_properties");
    return {
      source: resp.source,
      reason: resp.reason,
      properties: unwrapList<HostexProperty>(resp.data, "properties"),
    };
  },
  async searchListingCalendars(params: {
    listing_id?: string | number;
    property_id?: string | number;
    start_date?: string;
    end_date?: string;
  }) {
    const resp = await invoke<any>("search_listing_calendars", params);
    return {
      source: resp.source,
      reason: resp.reason,
      calendars: unwrapList<HostexCalendarEntry>(resp.data, "calendars"),
    };
  },
  async searchTransactions(params: { start_date?: string; end_date?: string } = {}) {
    const resp = await invoke<any>("search_transactions", params);
    return {
      source: resp.source,
      reason: resp.reason,
      transactions: unwrapList<any>(resp.data, "transactions"),
    };
  },
};

export function formatChannelLabel(channel: string | null | undefined): string {
  if (!channel) return "—";
  const c = channel.toLowerCase();
  if (c.includes("airbnb")) return "Airbnb";
  if (c.includes("booking")) return "Booking";
  if (c.includes("vrbo") || c.includes("homeaway")) return "Vrbo";
  if (c.includes("direct")) return "Direto";
  if (c === "ical") return "iCal";
  return channel;
}

export function formatBRL(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
