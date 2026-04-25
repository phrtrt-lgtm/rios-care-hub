import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface IntakePayload {
  owner_name: string;
  owner_email: string;
  owner_phone?: string;
  property_address: string;
  property_nickname?: string;
  bedrooms_count: number;
  living_rooms_count: number;
  bathrooms_count: number;
  suites_count: number;
  building_floors?: number | null;
  apartment_floor?: number | null;
  property_levels: number;
  has_elevator: boolean;
  has_wifi: boolean;
  max_capacity: number;
  parking_spots: number;
  rooms_data: unknown[];
  kitchen_items: string[];
  special_amenities: string[];
  condo_amenities: string[];
  notes?: string;
  previously_listed_airbnb?: boolean | null;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function buildAdminEmailHtml(data: IntakePayload, submissionId: string, portalUrl: string) {
  const fmtBool = (v: boolean) => (v ? "Sim" : "Não");
  const list = (arr: string[]) => (arr?.length ? arr.join(", ") : "—");
  const roomsSummary = (data.rooms_data as Array<{ name?: string; type?: string; floor?: number; beds?: Array<{ type: string; count: number }>; hasAC?: boolean; hasTV?: boolean; hasBalcony?: boolean; hasOutdoorArea?: boolean }>).map((r, i) => {
    const beds = (r.beds || []).map(b => `${b.count}× ${b.type}`).join(", ") || "—";
    const features = [
      r.hasAC && "AC",
      r.hasTV && "TV",
      r.hasBalcony && "Varanda",
      r.hasOutdoorArea && "Área externa",
    ].filter(Boolean).join(" · ");
    return `<li style="margin-bottom:6px;"><strong>${r.name || `Cômodo ${i + 1}`}</strong> (Pav. ${r.floor || 1}) — Camas: ${beds}${features ? ` · ${features}` : ""}</li>`;
  }).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;margin:0;padding:0;">
<div style="max-width:680px;margin:0 auto;background:#fff;">
  <div style="background:linear-gradient(135deg,#0ea5e9 0%,#6366f1 100%);padding:32px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">RIOS</h1>
    <p style="color:rgba(255,255,255,0.9);margin:6px 0 0;font-size:14px;">Nova ficha de potencial proprietário</p>
  </div>
  <div style="padding:32px;">
    <h2 style="color:#0f172a;font-size:20px;margin:0 0 16px;">${data.owner_name}</h2>
    <p style="color:#475569;margin:0 0 4px;">📧 ${data.owner_email}</p>
    ${data.owner_phone ? `<p style="color:#475569;margin:0 0 16px;">📱 ${data.owner_phone}</p>` : ""}

    <h3 style="color:#0f172a;font-size:16px;margin:24px 0 8px;">Imóvel</h3>
    <p style="color:#334155;margin:0 0 8px;"><strong>${data.property_nickname || "Sem apelido"}</strong></p>
    <p style="color:#475569;margin:0 0 12px;">📍 ${data.property_address}</p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <tr><td style="padding:6px 0;color:#64748b;">Quartos</td><td style="text-align:right;color:#0f172a;font-weight:600;">${data.bedrooms_count}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;">Salas</td><td style="text-align:right;color:#0f172a;font-weight:600;">${data.living_rooms_count}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;">Banheiros</td><td style="text-align:right;color:#0f172a;font-weight:600;">${data.bathrooms_count}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;">Suítes</td><td style="text-align:right;color:#0f172a;font-weight:600;">${data.suites_count}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;">Pavimentos do imóvel</td><td style="text-align:right;color:#0f172a;font-weight:600;">${data.property_levels}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;">Andares do prédio</td><td style="text-align:right;color:#0f172a;font-weight:600;">${data.building_floors ?? "—"}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;">Andar do apartamento</td><td style="text-align:right;color:#0f172a;font-weight:600;">${data.apartment_floor ?? "—"}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;">Capacidade máxima</td><td style="text-align:right;color:#0f172a;font-weight:600;">${data.max_capacity} pessoas</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;">Vagas de garagem</td><td style="text-align:right;color:#0f172a;font-weight:600;">${data.parking_spots}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;">Elevador</td><td style="text-align:right;color:#0f172a;font-weight:600;">${fmtBool(data.has_elevator)}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;">Wi-Fi</td><td style="text-align:right;color:#0f172a;font-weight:600;">${fmtBool(data.has_wifi)}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;">Já alugou pelo Airbnb?</td><td style="text-align:right;color:#0f172a;font-weight:600;">${data.previously_listed_airbnb === true ? "Sim" : data.previously_listed_airbnb === false ? "Não (primeira vez)" : "—"}</td></tr>
    </table>

    <h3 style="color:#0f172a;font-size:16px;margin:24px 0 8px;">Cômodos</h3>
    <ul style="color:#334155;padding-left:20px;margin:0 0 16px;">${roomsSummary || "<li>—</li>"}</ul>

    <h3 style="color:#0f172a;font-size:16px;margin:24px 0 8px;">Cozinha</h3>
    <p style="color:#334155;margin:0 0 16px;">${list(data.kitchen_items)}</p>

    <h3 style="color:#0f172a;font-size:16px;margin:24px 0 8px;">Comodidades especiais</h3>
    <p style="color:#334155;margin:0 0 16px;">${list(data.special_amenities)}</p>

    <h3 style="color:#0f172a;font-size:16px;margin:24px 0 8px;">Comodidades do condomínio</h3>
    <p style="color:#334155;margin:0 0 16px;">${list(data.condo_amenities)}</p>

    ${data.notes ? `<h3 style="color:#0f172a;font-size:16px;margin:24px 0 8px;">Observações</h3><p style="color:#334155;margin:0 0 16px;white-space:pre-wrap;">${data.notes}</p>` : ""}

    <div style="margin-top:32px;padding-top:24px;border-top:1px solid #e2e8f0;">
      <a href="${portalUrl}/admin/cadastros-proprietarios" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600;">Ver no painel</a>
    </div>
    <p style="color:#94a3b8;font-size:12px;margin-top:16px;">Submission ID: ${submissionId}</p>
  </div>
</div>
</body></html>`;
}

function buildOwnerWelcomeHtml(name: string, magicLink: string | null) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;margin:0;padding:0;">
<div style="max-width:600px;margin:0 auto;background:#fff;">
  <div style="background:linear-gradient(135deg,#0ea5e9 0%,#6366f1 100%);padding:48px 32px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:32px;letter-spacing:1px;">RIOS</h1>
    <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:14px;">Operação e Gestão de Hospedagens</p>
  </div>
  <div style="padding:40px 32px;">
    <h2 style="color:#0f172a;margin:0 0 16px;">Olá ${name}, recebemos sua ficha 🎉</h2>
    <p style="color:#475569;line-height:1.6;font-size:15px;">
      Sua proposta de parceria está em análise pela nossa equipe. Em breve entraremos em contato para agendar uma reunião e detalhar os próximos passos.
    </p>
    ${magicLink ? `
    <p style="color:#475569;line-height:1.6;font-size:15px;margin-top:24px;">
      Enquanto isso, criamos seu acesso ao portal. Defina sua senha clicando no botão abaixo:
    </p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${magicLink}" style="display:inline-block;background:#6366f1;color:#fff;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">Definir minha senha</a>
    </div>
    ` : ""}
    <p style="color:#94a3b8;font-size:13px;margin-top:32px;">— Equipe RIOS</p>
  </div>
</div>
</body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const MAIL_FROM = Deno.env.get("MAIL_FROM") || "RIOS <onboarding@resend.dev>";
    const rawAdminNotifyEmails = Deno.env.get("ADMIN_NOTIFY_EMAILS") || "";
    const ADMIN_NOTIFY_EMAILS = rawAdminNotifyEmails
      .split(/[;,\n]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((value, index, arr) => Boolean(value) && arr.indexOf(value) === index);
    const INVALID_ADMIN_NOTIFY_EMAILS = ADMIN_NOTIFY_EMAILS.filter((value) => !isValidEmail(value));
    const PORTAL_URL = "https://portal.rioshospedagens.com.br";

    const payload = (await req.json()) as IntakePayload;

    // --- Validação básica ---
    if (!payload?.owner_name?.trim() || payload.owner_name.length > 200) {
      return new Response(JSON.stringify({ error: "Nome inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!payload?.owner_email || !isValidEmail(payload.owner_email)) {
      return new Response(JSON.stringify({ error: "E-mail inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!payload?.property_address?.trim() || payload.property_address.length > 500) {
      return new Response(JSON.stringify({ error: "Endereço inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = payload.owner_email.trim().toLowerCase();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // --- Tenta criar usuário (perfil será criado automaticamente como pending_owner pelo trigger) ---
    let userId: string | null = null;
    let magicLink: string | null = null;

    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { name: payload.owner_name, phone: payload.owner_phone || null },
    });

    if (createErr) {
      const msg = createErr.message || "";
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        // Usuário já existe — busca pelo email para vincular submission
        const { data: existing } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", email)
          .maybeSingle();
        userId = existing?.id ?? null;
        console.log("User already exists, linking to existing profile:", userId);
      } else {
        console.error("Error creating user:", createErr);
      }
    } else {
      userId = created.user?.id ?? null;
    }

    // --- Gera magic link de definição de senha (se conseguimos criar/identificar usuário) ---
    if (userId) {
      try {
        const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
          type: "recovery",
          email,
          options: { redirectTo: `${PORTAL_URL}/login` },
        });
        if (!linkErr && linkData?.properties?.action_link) {
          magicLink = linkData.properties.action_link;
        }
      } catch (e) {
        console.error("magic link error", e);
      }
    }

    // --- Insere submission ---
    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null;
    const userAgent = req.headers.get("user-agent") || null;

    const { data: submission, error: subErr } = await supabase
      .from("property_intake_submissions")
      .insert({
        owner_name: payload.owner_name.trim(),
        owner_email: email,
        owner_phone: payload.owner_phone?.trim() || null,
        owner_profile_id: userId,
        property_address: payload.property_address.trim(),
        property_nickname: payload.property_nickname?.trim() || null,
        bedrooms_count: payload.bedrooms_count,
        living_rooms_count: payload.living_rooms_count,
        bathrooms_count: payload.bathrooms_count,
        suites_count: payload.suites_count,
        building_floors: payload.building_floors ?? null,
        apartment_floor: payload.apartment_floor ?? null,
        property_levels: payload.property_levels,
        has_elevator: !!payload.has_elevator,
        has_wifi: !!payload.has_wifi,
        max_capacity: payload.max_capacity,
        parking_spots: payload.parking_spots,
        rooms_data: payload.rooms_data || [],
        kitchen_items: payload.kitchen_items || [],
        special_amenities: payload.special_amenities || [],
        condo_amenities: payload.condo_amenities || [],
        notes: [
          payload.previously_listed_airbnb === true ? "[Já anunciou em plataformas anteriormente]" : payload.previously_listed_airbnb === false ? "[Primeira experiência com aluguel por temporada]" : null,
          payload.notes?.trim() || null,
        ].filter(Boolean).join("\n\n") || null,
        status: "novo",
        ip_address: ipAddress,
        user_agent: userAgent,
      })
      .select("id")
      .single();

    if (subErr || !submission) {
      console.error("Error inserting submission:", subErr);
      throw new Error("Falha ao salvar ficha");
    }

    // --- Envia e-mails (não bloqueia em caso de falha) ---
    console.log("[email] RESEND_API_KEY present:", !!RESEND_API_KEY);
    console.log("[email] MAIL_FROM:", MAIL_FROM);
    console.log("[email] ADMIN_NOTIFY_EMAILS:", ADMIN_NOTIFY_EMAILS);
    console.log("[email] INVALID_ADMIN_NOTIFY_EMAILS:", INVALID_ADMIN_NOTIFY_EMAILS);
    console.log("[email] owner email:", email);

    if (RESEND_API_KEY) {
      const adminHtml = buildAdminEmailHtml(payload, submission.id, PORTAL_URL);
      const ownerHtml = buildOwnerWelcomeHtml(payload.owner_name, magicLink);

      const sendEmail = async (to: string, subject: string, html: string) => {
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({ from: MAIL_FROM, to: [to], subject, html }),
          });
          const responseText = await res.text();
          if (!res.ok) {
            console.error(`[email] FAIL → to=${to} subject="${subject}" status=${res.status} body=${responseText}`);
            return { ok: false, to, status: res.status, body: responseText };
          } else {
            console.log(`[email] OK → to=${to} subject="${subject}" response=${responseText}`);
            return { ok: true, to, status: res.status, body: responseText };
          }
        } catch (e) {
          console.error(`[email] ERROR → to=${to} subject="${subject}"`, e);
          return { ok: false, to, status: 0, body: e instanceof Error ? e.message : String(e) };
        }
      };

      const validAdminEmails = ADMIN_NOTIFY_EMAILS.filter((value) => isValidEmail(value));

      if (validAdminEmails.length > 0) {
        const adminSubject = `🏠 Nova ficha: ${payload.owner_name} — ${payload.property_nickname || payload.property_address.slice(0, 40)}`;
        const adminResults = await Promise.all(validAdminEmails.map((adminEmail) => sendEmail(adminEmail, adminSubject, adminHtml)));
        console.log("[email] admin send summary:", adminResults);
      } else {
        console.warn("[email] ADMIN_NOTIFY_EMAILS vazio — nenhuma notificação admin será enviada");
      }
      await sendEmail(email, "Recebemos sua ficha — RIOS Hospedagens", ownerHtml);
    } else {
      console.warn("[email] RESEND_API_KEY not set, skipping email send");
    }

    return new Response(
      JSON.stringify({ success: true, submission_id: submission.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("submit-property-intake error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
