import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Minimal iCal parser – extracts VEVENT blocks from an .ics feed.
 * Returns an array of event objects.
 */
function parseIcal(raw: string) {
  const events: Array<{
    uid: string;
    summary: string;
    dtstart: string;
    dtend: string;
    description: string;
  }> = [];

  // Unfold lines (RFC 5545 §3.1)
  const unfolded = raw.replace(/\r\n[ \t]/g, "").replace(/\r/g, "");
  const blocks = unfolded.split("BEGIN:VEVENT");

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split("END:VEVENT")[0];
    const lines = block.split("\n");
    const ev: Record<string, string> = {};

    for (const line of lines) {
      // Handle properties with parameters (e.g., DTSTART;VALUE=DATE:20250101)
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      let key = line.substring(0, colonIdx);
      const value = line.substring(colonIdx + 1).trim();

      // Strip parameters from key
      const semiIdx = key.indexOf(";");
      if (semiIdx !== -1) key = key.substring(0, semiIdx);

      ev[key.toUpperCase()] = value;
    }

    if (ev.DTSTART) {
      events.push({
        uid: ev.UID || `auto-${Date.now()}-${i}`,
        summary: ev.SUMMARY || "",
        dtstart: parseIcalDate(ev.DTSTART),
        dtend: parseIcalDate(ev.DTEND || ev.DTSTART),
        description: ev.DESCRIPTION || "",
      });
    }
  }

  return events;
}

/** Convert iCal date formats to ISO date string (YYYY-MM-DD) */
function parseIcalDate(d: string): string {
  // Format: 20250615 or 20250615T120000Z
  const clean = d.replace(/[^0-9]/g, "");
  if (clean.length >= 8) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
  }
  return d;
}

/** Extract guest name from summary/description */
function extractGuestName(summary: string, description: string): string | null {
  // Common patterns: "Reserved - John Doe", "Airbnb (John Doe)", etc.
  const patterns = [
    /Reserved\s*-\s*(.+)/i,
    /\(([^)]+)\)/,
    /Guest:\s*(.+)/i,
    /Hóspede:\s*(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = summary.match(pattern) || description.match(pattern);
    if (match) return match[1].trim();
  }

  // If summary is not a generic word, use it as guest reference
  const generic = [
    "reserved", "blocked", "not available", "airbnb", "booking.com",
    "bloqueado", "indisponível", "reservado",
  ];
  if (summary && !generic.some((g) => summary.toLowerCase().includes(g))) {
    return summary;
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Allow filtering by property_id or sync all
    const url = new URL(req.url);
    const propertyId = url.searchParams.get("property_id");

    let query = supabase.from("property_ical_links").select("*");
    if (propertyId) query = query.eq("property_id", propertyId);

    const { data: links, error: linksError } = await query;
    if (linksError) throw linksError;

    if (!links || links.length === 0) {
      return new Response(
        JSON.stringify({ message: "No iCal links found", synced: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{
      property_id: string;
      events_count: number;
      error?: string;
    }> = [];

    for (const link of links) {
      try {
        console.log(`Fetching iCal for property ${link.property_id}: ${link.ical_url}`);
        
        const response = await fetch(link.ical_url, {
          headers: { "User-Agent": "RIOS-Calendar-Sync/1.0" },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const icalText = await response.text();
        const events = parseIcal(icalText);

        console.log(`Parsed ${events.length} events for property ${link.property_id}`);

        // Upsert reservations
        let upsertCount = 0;
        for (const event of events) {
          const guestName = extractGuestName(event.summary, event.description);

          const { error: upsertError } = await supabase
            .from("reservations")
            .upsert(
              {
                property_id: link.property_id,
                ical_link_id: link.id,
                ical_uid: event.uid,
                summary: event.summary || null,
                check_in: event.dtstart,
                check_out: event.dtend,
                guest_name: guestName,
                status: "confirmed",
                raw_data: event,
              },
              { onConflict: "property_id,ical_uid" }
            );

          if (upsertError) {
            console.error(`Upsert error for event ${event.uid}:`, upsertError);
          } else {
            upsertCount++;
          }
        }

        // Remove old reservations that no longer exist in the feed
        const currentUids = events.map((e) => e.uid);
        if (currentUids.length > 0) {
          await supabase
            .from("reservations")
            .delete()
            .eq("property_id", link.property_id)
            .eq("ical_link_id", link.id)
            .not("ical_uid", "in", `(${currentUids.map(u => `"${u}"`).join(",")})`);
        }

        // Update sync status
        await supabase
          .from("property_ical_links")
          .update({ last_synced_at: new Date().toISOString(), sync_error: null })
          .eq("id", link.id);

        results.push({
          property_id: link.property_id,
          events_count: upsertCount,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        console.error(`Error syncing ${link.property_id}:`, errorMsg);

        await supabase
          .from("property_ical_links")
          .update({ sync_error: errorMsg })
          .eq("id", link.id);

        results.push({
          property_id: link.property_id,
          events_count: 0,
          error: errorMsg,
        });
      }
    }

    return new Response(
      JSON.stringify({
        message: `Synced ${results.length} calendars`,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("sync-ical error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
