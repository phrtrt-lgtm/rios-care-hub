import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const email = "teste@rios.com";
    const password = "teste123";
    const name = "Carlos Teste Proprietário";
    const phone = "(21) 99999-1234";

    let userId: string;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, phone },
    });

    if (createErr && createErr.message.toLowerCase().includes("registered")) {
      // find existing
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = list.users.find((u: any) => u.email === email);
      if (!existing) throw new Error("user not found after dup error");
      userId = existing.id;
      await admin.auth.admin.updateUserById(userId, { password, email_confirm: true, user_metadata: { name, phone } });
    } else if (createErr) {
      throw createErr;
    } else {
      userId = created!.user!.id;
    }

    await admin.from("profiles").update({
      name,
      phone,
      role: "pending_owner",
      status: "pending",
      onboarding_stage: "welcome",
    }).eq("id", userId);

    await admin.from("property_intake_submissions").delete().eq("owner_profile_id", userId);

    const { error: intakeErr } = await admin.from("property_intake_submissions").insert({
      owner_profile_id: userId,
      owner_name: name,
      owner_email: email,
      owner_phone: phone,
      property_nickname: "Cobertura Vista Mar - Copacabana",
      property_address: "Av. Atlântica, 1500 - Copacabana, Rio de Janeiro - RJ",
      bedrooms_count: 3,
      living_rooms_count: 2,
      bathrooms_count: 3,
      suites_count: 2,
      building_floors: 12,
      apartment_floor: 11,
      property_levels: 2,
      has_elevator: true,
      has_wifi: true,
      max_capacity: 6,
      parking_spots: 2,
      rooms_data: [],
      kitchen_items: ["Fogão", "Geladeira", "Microondas", "Cafeteira", "Lava-louças"],
      special_amenities: ["Vista para o mar", "Varanda gourmet", "Hidromassagem"],
      condo_amenities: ["Piscina", "Academia", "Sauna", "Portaria 24h", "Churrasqueira"],
      notes: "Imóvel reformado em 2024, mobiliado e decorado. Já anunciado anteriormente no Airbnb.",
      status: "pending",
    });

    if (intakeErr) throw intakeErr;

    return new Response(
      JSON.stringify({ ok: true, userId, email, password }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
