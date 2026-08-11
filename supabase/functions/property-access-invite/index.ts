import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const DEFAULT_PASSWORD = "rios123";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "Não autenticado" }, 401);

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "Não autenticado" }, 401);
    const actorId = userData.user.id;

    const { data: actorProfile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", actorId)
      .single();

    if (!actorProfile || !["admin", "agent", "maintenance"].includes(actorProfile.role)) {
      return json({ error: "Apenas a equipe pode conceder acessos" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const propertyId: string | undefined = body.propertyId;
    const rawEmail: string | undefined = body.email;
    const name: string = (body.name ?? "").trim();
    const note: string | null = body.note?.trim() || null;

    const email = rawEmail?.trim().toLowerCase();
    if (!propertyId || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ error: "Informe o imóvel e um e-mail válido" }, 400);
    }

    const { data: property } = await admin
      .from("properties")
      .select("id, name, owner_id")
      .eq("id", propertyId)
      .single();

    if (!property) return json({ error: "Imóvel não encontrado" }, 404);

    // Localiza ou cria o usuário
    let targetId: string | null = null;
    let created = false;

    const { data: existing } = await admin
      .from("profiles")
      .select("id, name, role, status")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      targetId = existing.id;
      if (existing.status !== "approved") {
        await admin.from("profiles").update({ status: "approved" }).eq("id", existing.id);
      }
    } else {
      const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: { name: name || email },
      });
      if (authError || !authData.user) {
        return json({ error: authError?.message ?? "Falha ao criar usuário" }, 500);
      }
      targetId = authData.user.id;
      created = true;

      await admin
        .from("profiles")
        .update({
          role: "owner",
          status: "approved",
          name: name || email,
          must_set_password: true,
        })
        .eq("id", targetId);
    }

    if (targetId === property.owner_id) {
      return json({ error: "Esta pessoa já é o titular do imóvel" }, 400);
    }

    const { error: memberError } = await admin
      .from("property_members")
      .upsert(
        { property_id: propertyId, user_id: targetId, invited_by: actorId, note },
        { onConflict: "property_id,user_id" },
      );

    if (memberError) return json({ error: memberError.message }, 500);

    await admin.from("notifications").insert({
      owner_id: targetId,
      type: "system",
      title: "Você recebeu acesso a um imóvel",
      message: `Agora você acompanha ${property.name} no portal RIOS: cobranças, manutenções, vistorias e relatórios.`,
      reference_url: "/painel",
    });

    return json({
      success: true,
      userId: targetId,
      created,
      defaultPassword: created ? DEFAULT_PASSWORD : null,
    });
  } catch (error) {
    console.error("property-access-invite error:", error);
    return json({ error: error instanceof Error ? error.message : "Erro inesperado" }, 500);
  }
});
