// hostex-proxy — leitura via cache local (sync 6h) + fallback ao vivo + iCal
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const HOSTEX_BASE = "https://api.hostex.io/v3";
const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
const STALE_THRESHOLD_HOURS = 12;

type Action =
  | "search_reservations"
  | "search_properties"
  | "search_listing_calendars"
  | "search_transactions";

const ACTION_PATHS: Record<Action, string> = {
  search_reservations: "/reservations",
  search_properties: "/properties",
  search_listing_calendars: "/listings/calendars",
  search_transactions: "/transactions",
};

const ALLOWED_ACTIONS = new Set<Action>(Object.keys(ACTION_PATHS) as Action[]);
const cache = new Map<string, { at: number; payload: any }>();

function cacheKey(action: string, params: unknown) {
  return `${action}:${JSON.stringify(params ?? {})}`;
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

function toQuery(params: Record<string, any> | undefined): string {
  if (!params) return "";
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) for (const i of v) usp.append(k, String(i));
    else usp.append(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

function fromCents(c: number | null | undefined): number {
  return c == null ? 0 : c / 100;
}

// ─── Cache local (preferido) ─────────────────────────────────────────────
async function fromLocalCache(action: Action, params: any, supabase: any): Promise<{
  data: any;
  synced_at: string | null;
  count: number;
}> {
  if (action === "search_reservations") {
    let q = supabase
      .from("hostex_reservations")
      .select("*")
      .neq("status", "cancelled")
      .order("check_in_date", { ascending: true })
      .limit(5000);
    if (params?.start_date) q = q.gte("check_out_date", params.start_date);
    if (params?.end_date) q = q.lte("check_in_date", params.end_date);
    if (params?.property_id) q = q.eq("property_id", params.property_id);
    if (params?.channel_type) q = q.eq("channel_type", params.channel_type);
    if (params?.status) q = q.eq("status", params.status);
    const { data, error } = await q;
    if (error) throw error;
    const reservations = (data || []).map((r: any) => ({
      reservation_code: r.reservation_code,
      property_id: r.property_id ?? r.property_id_hostex,
      property_name: r.property_name,
      channel_type: r.channel_type,
      check_in_date: r.check_in_date,
      check_out_date: r.check_out_date,
      number_of_guests: r.guests,
      status: r.status,
      stay_status: r.stay_status,
      guest_name: r.guest_name,
      booked_at: r.booked_at,
      rates: {
        total_rate: { amount: fromCents(r.total_rate_cents), currency: r.currency },
        total_commission: { amount: fromCents(r.total_commission_cents), currency: r.currency },
      },
    }));
    const synced = data?.[0]?.synced_at ?? null;
    return { data: { reservations }, synced_at: synced, count: reservations.length };
  }

  if (action === "search_properties") {
    const { data, error } = await supabase
      .from("hostex_properties")
      .select("*")
      .order("name");
    if (error) throw error;
    const properties = (data || []).map((p: any) => ({
      id: p.property_id ?? p.id_hostex,
      id_hostex: p.id_hostex,
      name: p.name,
      address: p.address,
    }));
    return { data: { properties }, synced_at: data?.[0]?.synced_at ?? null, count: properties.length };
  }

  if (action === "search_listing_calendars") {
    let q = supabase
      .from("hostex_reservations")
      .select("property_id, property_id_hostex, check_in_date, check_out_date, status")
      .neq("status", "cancelled")
      .order("check_in_date", { ascending: true })
      .limit(5000);
    if (params?.start_date) q = q.gte("check_out_date", params.start_date);
    if (params?.end_date) q = q.lte("check_in_date", params.end_date);
    const pid = params?.listing_id || params?.property_id;
    if (pid) q = q.or(`property_id.eq.${pid},property_id_hostex.eq.${pid}`);
    const { data, error } = await q;
    if (error) throw error;
    const calendars = (data || []).map((r: any) => ({
      listing_id: r.property_id ?? r.property_id_hostex,
      start_date: r.check_in_date,
      end_date: r.check_out_date,
      status: "unavailable",
    }));
    return { data: { calendars }, synced_at: null, count: calendars.length };
  }

  return { data: { transactions: [] }, synced_at: null, count: 0 };
}

async function isCacheStale(supabase: any): Promise<boolean> {
  const { data } = await supabase
    .from("hostex_sync_log")
    .select("finished_at, status")
    .eq("status", "ok")
    .order("finished_at", { ascending: false })
    .limit(1);
  const last = data?.[0]?.finished_at;
  if (!last) return true;
  const ageH = (Date.now() - new Date(last).getTime()) / 3_600_000;
  return ageH > STALE_THRESHOLD_HOURS;
}

// (sem fallback iCal — Hostex é a única fonte de reservas)


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action as Action | undefined;
    const params = body?.params ?? {};

    if (!action || !ALLOWED_ACTIONS.has(action)) {
      return new Response(
        JSON.stringify({ error: "action_not_allowed" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const key = cacheKey(action, params);
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return new Response(JSON.stringify({ ...cached.payload, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Tenta cache local (exceto transactions)
    if (action !== "search_transactions") {
      try {
        const result = await fromLocalCache(action, params, supabase);
        if (result.count > 0) {
          const stale = await isCacheStale(supabase);
          const payload = {
            source: stale ? "hostex_cache_stale" : "hostex_cache",
            synced_at: result.synced_at,
            data: result.data,
          };
          cache.set(key, { at: Date.now(), payload });
          return new Response(JSON.stringify(payload), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch (e) {
        console.warn("local cache read failed:", e);
      }
    }

    // 2) Tenta Hostex ao vivo
    const apiKey = Deno.env.get("HOSTEX_API_KEY");
    if (apiKey) {
      try {
        const url = `${HOSTEX_BASE}${ACTION_PATHS[action]}${toQuery(params)}`;
        const resp = await fetchWithTimeout(
          url,
          {
            method: "GET",
            headers: {
              "Hostex-Access-Token": apiKey,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
          },
          REQUEST_TIMEOUT_MS,
        );
        if (!resp.ok) {
          const txt = await resp.text();
          throw new Error(`hostex_${resp.status}: ${txt.slice(0, 200)}`);
        }
        const json = await resp.json();
        const payload = { source: "hostex_live", data: json };
        cache.set(key, { at: Date.now(), payload });
        return new Response(JSON.stringify(payload), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        console.error("hostex live failed:", e);
      }
    }

    // 3) Fallback iCal
    try {
      const data = await fallbackFromIcal(action, params, supabase);
      const payload = { source: "ical_fallback", data };
      return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      return new Response(
        JSON.stringify({ source: "error", error: e instanceof Error ? e.message : "fallback_failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } catch (e) {
    return new Response(
      JSON.stringify({ source: "error", error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
