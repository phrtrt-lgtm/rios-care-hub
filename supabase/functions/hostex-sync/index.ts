// hostex-sync — sincroniza propriedades e reservas da Hostex para o cache local
// Rodado por pg_cron a cada 6h ou on-demand via ?force=1
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const HOSTEX_BASE = "https://api.hostex.io/v3";
const SYNC_WINDOW_PAST_DAYS = 30;
const SYNC_WINDOW_FUTURE_DAYS = 180;
const CALENDAR_WINDOW_DAYS = 60; // janela de preços futuros (atual)
const CALENDAR_BATCH_SIZE = 20; // listings por chamada /listings/calendar
const PAGE_SIZE = 100;

function toMoneyCents(v: any): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function hostexGet(path: string, params: Record<string, any>, apiKey: string) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    usp.append(k, String(v));
  }
  const url = `${HOSTEX_BASE}${path}?${usp.toString()}`;
  const resp = await fetch(url, {
    headers: {
      "Hostex-Access-Token": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`hostex_${resp.status}: ${txt.slice(0, 300)}`);
  }
  return await resp.json();
}

async function hostexPost(path: string, body: Record<string, any>, apiKey: string) {
  const resp = await fetch(`${HOSTEX_BASE}${path}`, {
    method: "POST",
    headers: {
      "Hostex-Access-Token": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`hostex_${resp.status}: ${txt.slice(0, 300)}`);
  }
  return await resp.json();
}

function extractList(payload: any, key: string): any[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload[key])) return payload[key];
  if (payload.data && Array.isArray(payload.data[key])) return payload.data[key];
  if (payload.data && Array.isArray(payload.data)) return payload.data;
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  let body: any = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { /* noop */ }
  }
  const force = url.searchParams.get("force") === "1" || body?.force === true;
  const tokenParam = url.searchParams.get("token") || req.headers.get("x-cron-token");
  const cronToken = Deno.env.get("CRON_SECRET_TOKEN");
  const triggeredBy = force ? "manual" : "cron";

  // Em modo cron exige token; em modo manual exige JWT do supabase (verify_jwt=true)
  if (!force) {
    if (!cronToken || tokenParam !== cronToken) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const apiKey = Deno.env.get("HOSTEX_API_KEY");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Cria log
  const { data: logRow } = await supabase
    .from("hostex_sync_log")
    .insert({ status: "running", triggered_by: triggeredBy })
    .select("id")
    .single();
  const logId = logRow?.id as string | undefined;

  async function finishLog(patch: Record<string, any>) {
    if (!logId) return;
    await supabase
      .from("hostex_sync_log")
      .update({ ...patch, finished_at: new Date().toISOString() })
      .eq("id", logId);
  }

  if (!apiKey) {
    await finishLog({ status: "error", error_message: "missing_api_key" });
    return new Response(JSON.stringify({ error: "missing_api_key" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let propsUpserted = 0;
  let resUpserted = 0;
  let cancelled = 0;
  let calendarUpserted = 0;

  // Listings agregados de todas as propriedades para depois consultar /listings/calendar
  type ListingRef = { listing_id: string; channel_type: string; property_id_hostex: string; property_id: string | null };
  const allListings: ListingRef[] = [];

  try {
    // 1) Propriedades (paginadas)
    const propsList: any[] = [];
    {
      let offsetP = 0;
      let safetyP = 0;
      while (safetyP++ < 50) {
        const payload = await hostexGet("/properties", { offset: offsetP, limit: PAGE_SIZE }, apiKey);
        const list = extractList(payload, "properties");
        console.log(`[hostex-sync] properties page offset=${offsetP} got=${list.length}`);
        if (!list.length) break;
        propsList.push(...list);
        if (list.length < PAGE_SIZE) break;
        offsetP += PAGE_SIZE;
      }
      console.log(`[hostex-sync] total properties fetched: ${propsList.length}`);
    }

    // Carrega map de properties locais para casar por nome
    const { data: localProps } = await supabase.from("properties").select("id, name");
    const norm = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
    const localByName = new Map<string, string>();
    for (const p of localProps || []) {
      if (p.name) localByName.set(norm(p.name), p.id);
    }

    const hxPropertyMap = new Map<string, string | null>(); // id_hostex -> property_id local
    for (const p of propsList) {
      const id_hostex = String(p.id ?? p.property_id ?? p.listing_id ?? "");
      if (!id_hostex) continue;
      const name = p.name ?? p.title ?? "";
      const address = p.address ?? p.full_address ?? null;
      const matchedLocal = name ? localByName.get(norm(name)) ?? null : null;
      hxPropertyMap.set(id_hostex, matchedLocal);

      await supabase.from("hostex_properties").upsert(
        {
          id_hostex,
          name,
          address,
          property_id: matchedLocal,
          raw: p,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "id_hostex" },
      );
      propsUpserted++;

      // Preenche cover_photo_url da propriedade local se ainda não tiver
      const coverUrl =
        p?.cover?.large_url ?? p?.cover?.extra_large_url ?? p?.cover?.original_url ?? p?.cover?.small_url ?? null;
      if (matchedLocal && coverUrl) {
        await supabase
          .from("properties")
          .update({ cover_photo_url: coverUrl, updated_at: new Date().toISOString() })
          .eq("id", matchedLocal)
          .is("cover_photo_url", null);
      }

      // Coleta listings (channel_type + listing_id) para o passo de calendário
      const channels = Array.isArray(p.channels) ? p.channels : [];
      for (const ch of channels) {
        const lid = String(ch?.listing_id ?? "");
        const ct = String(ch?.channel_type ?? "");
        if (!lid || !ct) continue;
        allListings.push({
          listing_id: lid,
          channel_type: ct,
          property_id_hostex: id_hostex,
          property_id: matchedLocal,
        });
      }
    }

    // 2) Reservas (janela passado 30d ... futuro 180d)
    const now = new Date();
    const start = new Date(now.getTime() - SYNC_WINDOW_PAST_DAYS * 86400000);
    const end = new Date(now.getTime() + SYNC_WINDOW_FUTURE_DAYS * 86400000);
    const startStr = ymd(start);
    const endStr = ymd(end);

    const seenCodes = new Set<string>();
    let offset = 0;
    let safetyCounter = 0;
    while (safetyCounter++ < 200) {
      const payload = await hostexGet(
        "/reservations",
        {
          start_date: startStr,
          end_date: endStr,
          offset,
          limit: PAGE_SIZE,
        },
        apiKey,
      );
      const list = extractList(payload, "reservations");
      if (!list.length) break;

      const rows = list.map((r: any) => {
        const code = String(
          r.reservation_code ?? r.code ?? r.id ?? r.uid ?? "",
        );
        seenCodes.add(code);
        const hxPid = String(r.property_id ?? r.listing_id ?? "");
        const totalRate = r.rates?.total_rate?.amount ?? r.total_rate?.amount;
        const totalComm = r.rates?.total_commission?.amount ?? r.total_commission?.amount;
        return {
          reservation_code: code,
          property_id_hostex: hxPid || null,
          property_id: hxPid ? hxPropertyMap.get(hxPid) ?? null : null,
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
      }).filter((row: any) => row.reservation_code && row.check_in_date && row.check_out_date);

      if (rows.length) {
        const { error } = await supabase
          .from("hostex_reservations")
          .upsert(rows, { onConflict: "reservation_code" });
        if (error) throw new Error(`upsert_failed: ${error.message}`);
        resUpserted += rows.length;
      }

      if (list.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    // 3) Marca reservas sumidas no período como canceladas
    if (seenCodes.size > 0) {
      const { data: existing } = await supabase
        .from("hostex_reservations")
        .select("reservation_code")
        .gte("check_out_date", startStr)
        .lte("check_in_date", endStr)
        .neq("status", "cancelled");
      const toCancel: string[] = [];
      for (const row of existing || []) {
        if (!seenCodes.has(row.reservation_code)) toCancel.push(row.reservation_code);
      }
      if (toCancel.length) {
        await supabase
          .from("hostex_reservations")
          .update({ status: "cancelled", synced_at: new Date().toISOString() })
          .in("reservation_code", toCancel);
        cancelled = toCancel.length;
      }
    }

    // 4) Calendário de preços listados (preço atual cobrado) — próximos CALENDAR_WINDOW_DAYS dias
    const calStart = ymd(now);
    const calEnd = ymd(new Date(now.getTime() + CALENDAR_WINDOW_DAYS * 86400000));
    for (let i = 0; i < allListings.length; i += CALENDAR_BATCH_SIZE) {
      const batch = allListings.slice(i, i + CALENDAR_BATCH_SIZE);
      try {
        const payload = await hostexPost(
          "/listings/calendar",
          {
            start_date: calStart,
            end_date: calEnd,
            listings: batch.map((l) => ({ listing_id: l.listing_id, channel_type: l.channel_type })),
          },
          apiKey,
        );
        const listings = payload?.data?.listings ?? payload?.listings ?? [];
        const rows: any[] = [];
        for (const ld of listings) {
          const ref = batch.find(
            (b) => b.listing_id === String(ld.listing_id) && b.channel_type === String(ld.channel_type),
          );
          if (!ref) continue;
          for (const c of ld.calendar ?? []) {
            rows.push({
              listing_id: ref.listing_id,
              channel_type: ref.channel_type,
              property_id_hostex: ref.property_id_hostex,
              property_id: ref.property_id,
              date: c.date,
              price_cents: toMoneyCents(c.price),
              currency: c.currency ?? "BRL",
              inventory: c.inventory ?? null,
              min_stay: c.restrictions?.min_stay_on_arrival ?? c.restrictions?.min_stay_through ?? null,
              raw: c,
              synced_at: new Date().toISOString(),
            });
          }
        }
        if (rows.length) {
          const { error } = await supabase
            .from("hostex_listing_calendar")
            .upsert(rows, { onConflict: "listing_id,channel_type,date" });
          if (error) throw new Error(`calendar_upsert_failed: ${error.message}`);
          calendarUpserted += rows.length;
        }
      } catch (err) {
        console.error("hostex calendar batch failed:", err instanceof Error ? err.message : err);
        // continua para próximos batches
      }
    }

    await finishLog({
      status: "ok",
      reservations_upserted: resUpserted,
      properties_upserted: propsUpserted,
      reservations_cancelled: cancelled,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        reservations_upserted: resUpserted,
        properties_upserted: propsUpserted,
        reservations_cancelled: cancelled,
        calendar_days_upserted: calendarUpserted,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("hostex-sync failed:", msg);
    await finishLog({
      status: "error",
      error_message: msg,
      reservations_upserted: resUpserted,
      properties_upserted: propsUpserted,
      reservations_cancelled: cancelled,
    });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
