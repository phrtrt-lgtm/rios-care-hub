// hostex-proxy — proxy somente-leitura para Hostex API
// - Lê HOSTEX_API_KEY do secret (nunca exposto ao front)
// - Whitelist de actions de leitura
// - Cache em memória 5 min
// - Fallback: tabela `reservations` (alimentada pelo sync-ical TalkGuest)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const HOSTEX_BASE = "https://api.hostex.io/v3";
const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

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
    if (Array.isArray(v)) {
      for (const item of v) usp.append(k, String(item));
    } else {
      usp.append(k, String(v));
    }
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

// ─── Fallback (tabela reservations alimentada por sync-ical) ─────────────
async function fallbackFromDb(action: Action, params: any): Promise<any> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (action === "search_reservations") {
    let q = supabase
      .from("reservations")
      .select("id, property_id, check_in, check_out, guest_name, summary, status, properties(name)")
      .order("check_in", { ascending: true })
      .limit(2000);
    if (params?.start_date) q = q.gte("check_out", params.start_date);
    if (params?.end_date) q = q.lte("check_in", params.end_date);
    if (params?.property_id) q = q.eq("property_id", params.property_id);
    const { data, error } = await q;
    if (error) throw error;
    // Normaliza para o "shape" que o front espera (parecido com Hostex)
    return {
      reservations: (data || []).map((r: any) => ({
        reservation_code: r.id,
        property_id: r.property_id,
        property_name: r.properties?.name ?? null,
        channel_type: "ical",
        check_in_date: r.check_in,
        check_out_date: r.check_out,
        number_of_guests: null,
        status: r.status ?? "confirmed",
        stay_status: null,
        guest_name: r.guest_name,
        booked_at: null,
        rates: null,
      })),
    };
  }

  if (action === "search_listing_calendars") {
    let q = supabase
      .from("reservations")
      .select("property_id, check_in, check_out")
      .order("check_in", { ascending: true })
      .limit(2000);
    if (params?.start_date) q = q.gte("check_out", params.start_date);
    if (params?.end_date) q = q.lte("check_in", params.end_date);
    if (params?.listing_id || params?.property_id) {
      q = q.eq("property_id", params.listing_id || params.property_id);
    }
    const { data, error } = await q;
    if (error) throw error;
    return {
      calendars: (data || []).map((r: any) => ({
        listing_id: r.property_id,
        start_date: r.check_in,
        end_date: r.check_out,
        status: "unavailable",
      })),
    };
  }

  if (action === "search_properties") {
    const { data, error } = await supabase
      .from("properties")
      .select("id, name, address")
      .order("name");
    if (error) throw error;
    return {
      properties: (data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        address: p.address,
        channels: [],
      })),
    };
  }

  // search_transactions: sem fallback financeiro local
  return { transactions: [], unavailable: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action as Action | undefined;
    const params = body?.params ?? {};

    if (!action || !ALLOWED_ACTIONS.has(action)) {
      return new Response(
        JSON.stringify({ error: "action_not_allowed", allowed: [...ALLOWED_ACTIONS] }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const key = cacheKey(action, params);
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return new Response(
        JSON.stringify({ ...cached.payload, cached: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = Deno.env.get("HOSTEX_API_KEY");

    // Sem chave configurada → vai direto pro fallback
    if (!apiKey) {
      try {
        const data = await fallbackFromDb(action, params);
        const payload = { source: "ical_fallback", reason: "missing_api_key", data };
        cache.set(key, { at: Date.now(), payload });
        return new Response(JSON.stringify(payload), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        return new Response(
          JSON.stringify({ source: "error", error: e instanceof Error ? e.message : "fallback_failed" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Tenta Hostex
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
      const payload = { source: "hostex", data: json };
      cache.set(key, { at: Date.now(), payload });
      return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (hostexErr) {
      console.error("hostex-proxy: hostex failed, falling back to iCal:", hostexErr);
      try {
        const data = await fallbackFromDb(action, params);
        const payload = {
          source: "ical_fallback",
          reason: hostexErr instanceof Error ? hostexErr.message : "hostex_failed",
          data,
        };
        // cache fallback por menos tempo (1 min) pra retentar a hostex logo
        cache.set(key, { at: Date.now() - (CACHE_TTL_MS - 60_000), payload });
        return new Response(JSON.stringify(payload), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (fbErr) {
        return new Response(
          JSON.stringify({
            source: "error",
            error: fbErr instanceof Error ? fbErr.message : "fallback_failed",
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }
  } catch (e) {
    return new Response(
      JSON.stringify({ source: "error", error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
