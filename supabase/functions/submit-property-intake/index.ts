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

/* ----------------------------------------------------------------------------
 * Layout RIOS padrão (mesmo template usado em ticket_created_owner,
 * inspection_created, charge_created, etc.):
 *   - Background: #f5f7fb
 *   - Card: #ffffff, border-radius 12px
 *   - Header: #0f3150 (azul RIOS), texto branco
 *   - Botão CTA: #d36b4d (terracota), texto branco, border-radius 10px
 *   - Tipografia: Arial,Helvetica,sans-serif
 *   - Footer: #f0f2f7 com assinatura "Equipe RIOS"
 * -------------------------------------------------------------------------- */

const EMAIL_BG = "#f5f7fb";
const CARD_BG = "#ffffff";
const HEADER_BG = "#0f3150";
const BUTTON_BG = "#d36b4d";
const TEXT_DARK = "#11243a";
const TEXT_BODY = "#334155";
const TEXT_MUTED = "#64748b";
const FOOTER_BG = "#f0f2f7";
const FONT = "Arial,Helvetica,sans-serif";

function emailShell(opts: { title: string; preheader: string; heading: string; bodyHtml: string; ctaUrl?: string; ctaLabel?: string; footerNote?: string }) {
  const { title, preheader, heading, bodyHtml, ctaUrl, ctaLabel, footerNote } = opts;
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>${title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      .preheader { display:none!important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all; }
      @media (prefers-color-scheme: dark) {
        .card { background:#0b1e33 !important; }
        .text { color:#f1f5f9 !important; }
        .muted { color:#cbd5e1 !important; }
        .btn { background:${BUTTON_BG} !important; }
      }
      a { color:${HEADER_BG}; }
    </style>
  </head>
  <body style="margin:0;padding:0;background:${EMAIL_BG};">
    <div class="preheader">${preheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${EMAIL_BG};">
      <tr>
        <td align="center" style="padding:24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:${CARD_BG};border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:${HEADER_BG};padding:20px;">
                <h1 style="margin:0;font-family:${FONT};font-size:20px;line-height:24px;color:#ffffff;">
                  Rios • Portal do Proprietário
                </h1>
              </td>
            </tr>
            <tr>
              <td class="card" style="padding:24px;background:${CARD_BG};">
                <h2 style="margin:0 0 12px;font-family:${FONT};font-size:18px;line-height:24px;color:${HEADER_BG};">
                  ${heading}
                </h2>
                ${bodyHtml}
                ${ctaUrl && ctaLabel ? `
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${ctaUrl}" arcsize="10%" stroke="f" fillcolor="${BUTTON_BG}" style="height:44px;v-text-anchor:middle;width:240px;">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:${FONT};font-size:16px;">${ctaLabel}</center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-->
                <a href="${ctaUrl}" class="btn" style="display:inline-block;background:${BUTTON_BG};color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-family:${FONT};font-size:16px;line-height:20px;text-align:center;margin-top:8px;">
                  ${ctaLabel}
                </a>
                <!--<![endif]-->
                ` : ""}
                ${footerNote ? `<p class="muted" style="margin:16px 0 0;font-family:${FONT};font-size:12px;line-height:18px;color:${TEXT_MUTED};">${footerNote}</p>` : ""}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:${FOOTER_BG};">
                <p style="margin:0 0 6px;font-family:${FONT};font-size:12px;line-height:18px;color:${TEXT_BODY};">
                  Abraços,<br><strong>Equipe RIOS</strong>
                </p>
                <p style="margin:0;font-family:${FONT};font-size:11px;line-height:16px;color:${TEXT_MUTED};">
                  Este é um e-mail automático. Em caso de dúvidas, acesse o Portal.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildAdminEmailHtml(data: IntakePayload, submissionId: string, portalUrl: string) {
  const fmtBool = (v: boolean) => (v ? "Sim" : "Não");
  const list = (arr: string[]) => (arr?.length ? arr.join(", ") : "—");
  const rowStyle = `font-family:${FONT};font-size:14px;line-height:22px;color:${TEXT_BODY};padding:6px 0;`;
  const sectionTitle = `font-family:${FONT};font-size:15px;line-height:22px;color:${HEADER_BG};margin:20px 0 8px;font-weight:700;`;

  const roomsSummary = (data.rooms_data as Array<{ name?: string; type?: string; floor?: number; beds?: Array<{ type: string; count: number }>; hasAC?: boolean; hasTV?: boolean; hasBalcony?: boolean; hasOutdoorArea?: boolean }>).map((r, i) => {
    const beds = (r.beds || []).map(b => `${b.count}× ${b.type}`).join(", ") || "—";
    const features = [
      r.hasAC && "AC",
      r.hasTV && "TV",
      r.hasBalcony && "Varanda",
      r.hasOutdoorArea && "Área externa",
    ].filter(Boolean).join(" · ");
    return `<li style="margin-bottom:6px;font-family:${FONT};font-size:14px;line-height:22px;color:${TEXT_BODY};"><strong>${r.name || `Cômodo ${i + 1}`}</strong> (Pav. ${r.floor || 1}) — Camas: ${beds}${features ? ` · ${features}` : ""}</li>`;
  }).join("");

  const body = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px;">
      <tr><td style="${rowStyle}"><strong>Proprietário:</strong> ${data.owner_name}</td></tr>
      <tr><td style="${rowStyle}"><strong>E-mail:</strong> ${data.owner_email}</td></tr>
      ${data.owner_phone ? `<tr><td style="${rowStyle}"><strong>Telefone:</strong> ${data.owner_phone}</td></tr>` : ""}
    </table>

    <p style="${sectionTitle}">Imóvel</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px;">
      <tr><td style="${rowStyle}"><strong>Apelido:</strong> ${data.property_nickname || "—"}</td></tr>
      <tr><td style="${rowStyle}"><strong>Endereço:</strong> ${data.property_address}</td></tr>
    </table>

    <p style="${sectionTitle}">Características</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px;border-collapse:collapse;">
      <tr><td style="${rowStyle}">Quartos</td><td style="${rowStyle};text-align:right;color:${TEXT_DARK};font-weight:600;">${data.bedrooms_count}</td></tr>
      <tr><td style="${rowStyle}">Salas</td><td style="${rowStyle};text-align:right;color:${TEXT_DARK};font-weight:600;">${data.living_rooms_count}</td></tr>
      <tr><td style="${rowStyle}">Banheiros</td><td style="${rowStyle};text-align:right;color:${TEXT_DARK};font-weight:600;">${data.bathrooms_count}</td></tr>
      <tr><td style="${rowStyle}">Suítes</td><td style="${rowStyle};text-align:right;color:${TEXT_DARK};font-weight:600;">${data.suites_count}</td></tr>
      <tr><td style="${rowStyle}">Pavimentos do imóvel</td><td style="${rowStyle};text-align:right;color:${TEXT_DARK};font-weight:600;">${data.property_levels}</td></tr>
      <tr><td style="${rowStyle}">Andares do prédio</td><td style="${rowStyle};text-align:right;color:${TEXT_DARK};font-weight:600;">${data.building_floors ?? "—"}</td></tr>
      <tr><td style="${rowStyle}">Andar do apartamento</td><td style="${rowStyle};text-align:right;color:${TEXT_DARK};font-weight:600;">${data.apartment_floor ?? "—"}</td></tr>
      <tr><td style="${rowStyle}">Capacidade máxima</td><td style="${rowStyle};text-align:right;color:${TEXT_DARK};font-weight:600;">${data.max_capacity} pessoas</td></tr>
      <tr><td style="${rowStyle}">Vagas de garagem</td><td style="${rowStyle};text-align:right;color:${TEXT_DARK};font-weight:600;">${data.parking_spots}</td></tr>
      <tr><td style="${rowStyle}">Elevador</td><td style="${rowStyle};text-align:right;color:${TEXT_DARK};font-weight:600;">${fmtBool(data.has_elevator)}</td></tr>
      <tr><td style="${rowStyle}">Wi-Fi</td><td style="${rowStyle};text-align:right;color:${TEXT_DARK};font-weight:600;">${fmtBool(data.has_wifi)}</td></tr>
      <tr><td style="${rowStyle}">Já alugou pelo Airbnb?</td><td style="${rowStyle};text-align:right;color:${TEXT_DARK};font-weight:600;">${data.previously_listed_airbnb === true ? "Sim" : data.previously_listed_airbnb === false ? "Não (primeira vez)" : "—"}</td></tr>
    </table>

    <p style="${sectionTitle}">Cômodos</p>
    <ul style="padding-left:20px;margin:0 0 16px;">${roomsSummary || `<li style="font-family:${FONT};color:${TEXT_BODY};">—</li>`}</ul>

    <p style="${sectionTitle}">Cozinha</p>
    <p style="margin:0 0 16px;font-family:${FONT};font-size:14px;line-height:22px;color:${TEXT_BODY};">${list(data.kitchen_items)}</p>

    <p style="${sectionTitle}">Comodidades especiais</p>
    <p style="margin:0 0 16px;font-family:${FONT};font-size:14px;line-height:22px;color:${TEXT_BODY};">${list(data.special_amenities)}</p>

    <p style="${sectionTitle}">Comodidades do condomínio</p>
    <p style="margin:0 0 16px;font-family:${FONT};font-size:14px;line-height:22px;color:${TEXT_BODY};">${list(data.condo_amenities)}</p>

    ${data.notes ? `<p style="${sectionTitle}">Observações</p><p style="margin:0 0 16px;font-family:${FONT};font-size:14px;line-height:22px;color:${TEXT_BODY};white-space:pre-wrap;">${data.notes}</p>` : ""}
  `;

  return emailShell({
    title: "Nova ficha de potencial proprietário",
    preheader: `Nova ficha recebida de ${data.owner_name} — ${data.property_nickname || data.property_address.slice(0, 60)}`,
    heading: "🏠 Nova ficha de potencial proprietário",
    bodyHtml: body,
    ctaUrl: `${portalUrl}/admin/cadastros-proprietarios`,
    ctaLabel: "Ver no painel",
    footerNote: `Submission ID: <strong>${submissionId}</strong>`,
  });
}

function buildOwnerWelcomeHtml(name: string, magicLink: string | null) {
  const body = `
    <p class="text" style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:22px;color:${TEXT_DARK};">
      Olá <strong>${name}</strong>, recebemos sua ficha com sucesso 🎉
    </p>
    <p class="text" style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:22px;color:${TEXT_DARK};">
      Sua proposta de parceria está em análise pela nossa equipe. Em breve entraremos em contato para agendar uma reunião e detalhar os próximos passos.
    </p>
    ${magicLink ? `
    <p class="text" style="margin:0 0 8px;font-family:${FONT};font-size:15px;line-height:22px;color:${TEXT_DARK};">
      Enquanto isso, já criamos seu acesso ao Portal. Defina sua senha clicando no botão abaixo:
    </p>
    ` : `
    <p class="text" style="margin:0 0 8px;font-family:${FONT};font-size:15px;line-height:22px;color:${TEXT_DARK};">
      Acompanhe novidades e o status da parceria pelo Portal do Proprietário.
    </p>
    `}
  `;
  return emailShell({
    title: "Recebemos sua ficha — RIOS",
    preheader: `Olá ${name}, recebemos sua ficha. ${magicLink ? "Defina sua senha de acesso ao Portal." : "Em breve nossa equipe entrará em contato."}`,
    heading: "✅ Ficha recebida com sucesso",
    bodyHtml: body,
    ctaUrl: magicLink || "https://portal.rioshospedagens.com.br/login",
    ctaLabel: magicLink ? "Definir minha senha" : "Acessar o Portal",
  });
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
