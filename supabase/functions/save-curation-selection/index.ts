import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { curation_id, selected_items, total_amount_cents } = await req.json();
    if (!curation_id) throw new Error("curation_id obrigatório");
    const items = Array.isArray(selected_items) ? selected_items : [];

    // Verifica que a curadoria existe e está publicada (link público)
    const { data: cur, error: curErr } = await supabase
      .from("owner_curations")
      .select("id, status, paid_at")
      .eq("id", curation_id)
      .single();
    if (curErr || !cur) throw new Error("Curadoria não encontrada");
    if (cur.status !== "published") throw new Error("Curadoria não publicada");
    if (cur.paid_at) {
      // não sobrescreve seleção depois de pago
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error } = await supabase
      .from("owner_curations")
      .update({
        selected_items: items,
        total_amount_cents: typeof total_amount_cents === "number" ? total_amount_cents : null,
      })
      .eq("id", curation_id);
    if (error) throw error;

    return new Response(JSON.stringify({ success: true, count: items.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("save-curation-selection error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
