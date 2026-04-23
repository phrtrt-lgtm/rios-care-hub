import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type EntityType = "inspection" | "ticket" | "charge";

interface Body {
  entity_type: EntityType;
  entity_id: string;
  comment_id?: string;
  mentioned_user_ids: string[];
  author_id: string;
  body: string;
}

const ROUTE_BY_ENTITY: Record<EntityType, (id: string) => string> = {
  inspection: (id) => `/admin/vistorias/${id}`,
  ticket: (id) => `/ticket/${id}`,
  charge: (id) => `/cobranca/${id}`,
};

const TITLE_BY_ENTITY: Record<EntityType, string> = {
  inspection: "Você foi mencionado em uma vistoria",
  ticket: "Você foi mencionado em um chamado",
  charge: "Você foi mencionado em uma cobrança",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = (await req.json()) as Body;
    const {
      entity_type,
      entity_id,
      mentioned_user_ids,
      author_id,
      body,
    } = payload;

    if (!entity_type || !entity_id || !Array.isArray(mentioned_user_ids)) {
      return new Response(JSON.stringify({ error: "invalid_payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter out self-mentions and dedupe
    const targets = Array.from(
      new Set(mentioned_user_ids.filter((id) => id && id !== author_id))
    );
    if (targets.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Resolve author name for the message
    const { data: author } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", author_id)
      .maybeSingle();

    const authorName = author?.name ?? "Alguém";
    const link = ROUTE_BY_ENTITY[entity_type](entity_id);
    const title = TITLE_BY_ENTITY[entity_type];

    // Strip mention tokens from body for preview
    const preview = body
      .replace(/@\[([^\]]+)\]\([0-9a-f-]+\)/g, "@$1")
      .slice(0, 140);

    const rows = targets.map((uid) => ({
      owner_id: uid,
      title,
      message: `${authorName}: ${preview}`,
      type: entity_type,
      reference_id: entity_id,
      reference_url: link,
      link,
      entity_type,
      entity_id,
      read: false,
    }));

    const { error } = await supabase.from("notifications").insert(rows);
    if (error) {
      console.error("notify-mentions insert error", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, sent: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("notify-mentions fatal", e);
    return new Response(JSON.stringify({ error: e.message ?? "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
