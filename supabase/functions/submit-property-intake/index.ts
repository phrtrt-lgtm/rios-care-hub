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

// ===== Design tokens (RIOS brand) =====
const BRAND_BLUE = "#0f3150";
const BRAND_BLUE_LIGHT = "#3a7ca8";
const BRAND_TERRA = "#d36b4d";
const TEXT_DARK = "#1a2332";
const TEXT_MID = "#4b5563";
const TEXT_MUTED = "#8a93a3";
const BORDER = "#e5e9f0";
const BG_PAGE = "#f5f7fb";
const BG_CARD = "#ffffff";
const BG_SOFT = "#f8fafc";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function statRow(label: string, value: string | number) {
  return `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid ${BORDER};color:${TEXT_MID};font-size:15px;">${escapeHtml(label)}</td>
      <td style="padding:14px 0;border-bottom:1px solid ${BORDER};color:${TEXT_DARK};font-size:16px;font-weight:700;text-align:right;">${escapeHtml(value)}</td>
    </tr>`;
}

// Bloco em grade 2 colunas para estatísticas — mais visual e legível
function statBlocks(items: Array<{ label: string; value: string | number }>): string {
  const cells = items.map(
    (it) => `
      <td width="50%" valign="top" style="padding:6px;">
        <div style="background:${BG_SOFT};border:1px solid ${BORDER};border-radius:10px;padding:14px 16px;">
          <p style="margin:0 0 4px;color:${TEXT_MUTED};font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">${escapeHtml(it.label)}</p>
          <p style="margin:0;color:${TEXT_DARK};font-size:18px;font-weight:700;">${escapeHtml(it.value)}</p>
        </div>
      </td>`
  );
  // agrupa de 2 em 2 em <tr>
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += 2) {
    rows.push(`<tr>${cells[i] || ""}${cells[i + 1] || `<td width="50%" style="padding:6px;"></td>`}</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:-6px;">${rows.join("")}</table>`;
}

function pillList(items: string[]): string {
  if (!items?.length) {
    return `<p style="margin:0;color:${TEXT_MUTED};font-size:14px;font-style:italic;">Nenhum item informado</p>`;
  }
  return `<div style="line-height:2.2;">${items
    .map(
      (item) =>
        `<span style="display:inline-block;background:${BG_SOFT};border:1px solid ${BORDER};color:${TEXT_DARK};font-size:14px;font-weight:500;padding:7px 14px;border-radius:999px;margin:0 6px 6px 0;">${escapeHtml(
          item
        )}</span>`
    )
    .join("")}</div>`;
}

function sectionTitle(title: string, subtitle?: string) {
  return `
  <tr><td style="padding:36px 32px 12px;">
    <h3 style="margin:0;color:${BRAND_BLUE};font-size:16px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">${escapeHtml(title)}</h3>
    ${subtitle ? `<p style="margin:6px 0 0;color:${TEXT_MUTED};font-size:14px;">${escapeHtml(subtitle)}</p>` : ""}
    <div style="height:3px;width:44px;background:${BRAND_TERRA};margin-top:12px;border-radius:2px;"></div>
  </td></tr>`;
}

function emailShell(opts: {
  preheader: string;
  heading: string;
  subheading?: string;
  bodyHtml: string;
  footerNote?: string;
}) {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BG_PAGE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${TEXT_DARK};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG_PAGE};padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:${BG_CARD};border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(15,49,80,0.06);">
      <!-- Header -->
      <tr><td style="background:${BRAND_BLUE};padding:36px 32px;text-align:center;">
        <div style="display:inline-block;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:6px 14px;margin-bottom:16px;">
          <span style="color:#fff;font-size:11px;font-weight:600;letter-spacing:0.18em;">RIOS HOSPEDAGENS</span>
        </div>
        <h1 style="margin:0;color:#fff;font-size:22px;font-weight:600;line-height:1.3;">${escapeHtml(opts.heading)}</h1>
        ${opts.subheading ? `<p style="margin:10px 0 0;color:rgba(255,255,255,0.78);font-size:14px;">${escapeHtml(opts.subheading)}</p>` : ""}
        <div style="height:3px;width:48px;background:${BRAND_TERRA};margin:18px auto 0;border-radius:2px;"></div>
      </td></tr>

      ${opts.bodyHtml}

      <!-- Footer -->
      <tr><td style="background:#f0f2f7;padding:24px 32px;text-align:center;border-top:1px solid ${BORDER};">
        <p style="margin:0 0 6px;color:${TEXT_DARK};font-size:13px;font-weight:600;">Equipe RIOS</p>
        <p style="margin:0;color:${TEXT_MUTED};font-size:12px;line-height:1.5;">Operação e Gestão de Hospedagens<br><a href="https://portal.rioshospedagens.com.br" style="color:${BRAND_BLUE_LIGHT};text-decoration:none;">portal.rioshospedagens.com.br</a></p>
        ${opts.footerNote ? `<p style="margin:14px 0 0;color:${TEXT_MUTED};font-size:11px;">${escapeHtml(opts.footerNote)}</p>` : ""}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function buildAdminEmailHtml(data: IntakePayload, submissionId: string, portalUrl: string) {
  const fmtBool = (v: boolean) => (v ? "✓ Sim" : "— Não");
  const rooms = (data.rooms_data as Array<{ name?: string; type?: string; floor?: number; beds?: Array<{ type: string; count: number }>; hasAC?: boolean; hasTV?: boolean; hasBalcony?: boolean; hasOutdoorArea?: boolean }>) || [];

  // Agrupa cômodos por pavimento
  const roomsByFloor = new Map<number, typeof rooms>();
  rooms.forEach((r) => {
    const floor = r.floor || 1;
    if (!roomsByFloor.has(floor)) roomsByFloor.set(floor, []);
    roomsByFloor.get(floor)!.push(r);
  });
  const sortedFloors = Array.from(roomsByFloor.keys()).sort((a, b) => a - b);

  const floorLabel = (floor: number) => {
    if (floor === 0) return "Térreo";
    if (floor === 1 && data.property_levels === 1) return "Pavimento único";
    return `${floor}º Pavimento`;
  };

  const renderRoomCard = (r: typeof rooms[number], i: number) => {
    const beds = (r.beds || []).map((b) => `${b.count}× ${b.type}`).join(" · ") || "Sem camas informadas";
    const features = [
      r.hasAC && "❄ Ar-condicionado",
      r.hasTV && "📺 TV",
      r.hasBalcony && "🌿 Varanda",
      r.hasOutdoorArea && "🌳 Área externa",
    ].filter(Boolean) as string[];
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid ${BORDER};border-radius:12px;margin-bottom:12px;box-shadow:0 1px 3px rgba(15,49,80,0.04);">
        <tr><td style="padding:18px 20px;">
          <p style="margin:0 0 10px;color:${BRAND_BLUE};font-size:17px;font-weight:700;line-height:1.3;">${escapeHtml(r.name || `Cômodo ${i + 1}`)}</p>
          <p style="margin:0 0 ${features.length ? "12px" : "0"};color:${TEXT_DARK};font-size:15px;line-height:1.5;"><span style="color:${TEXT_MUTED};">🛏</span> ${escapeHtml(beds)}</p>
          ${features.length ? `<div style="line-height:2;">${features.map((f) => `<span style="display:inline-block;background:${BG_SOFT};border:1px solid ${BORDER};color:${TEXT_DARK};font-size:13px;font-weight:500;padding:5px 11px;border-radius:6px;margin:0 5px 5px 0;">${escapeHtml(f)}</span>`).join("")}</div>` : ""}
        </td></tr>
      </table>`;
  };

  const roomsHtml = rooms.length
    ? sortedFloors
        .map((floor) => {
          const floorRooms = roomsByFloor.get(floor)!;
          return `
            <div style="margin-bottom:24px;">
              <div style="display:inline-block;background:${BRAND_BLUE};color:#fff;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:6px 14px;border-radius:6px;margin-bottom:12px;">
                ${escapeHtml(floorLabel(floor))} · ${floorRooms.length} ${floorRooms.length === 1 ? "ambiente" : "ambientes"}
              </div>
              ${floorRooms.map((r, i) => renderRoomCard(r, i)).join("")}
            </div>`;
        })
        .join("")
    : `<p style="margin:0;color:${TEXT_MUTED};font-size:14px;font-style:italic;">Nenhum cômodo cadastrado</p>`;

  const airbnbStatus = data.previously_listed_airbnb === true
    ? "Sim — já tem experiência"
    : data.previously_listed_airbnb === false
      ? "Não — primeira vez"
      : "Não informado";

  const body = `
    <!-- Owner card -->
    <tr><td style="padding:32px 32px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,${BG_SOFT} 0%,#fff 100%);border:1px solid ${BORDER};border-radius:12px;">
        <tr><td style="padding:22px 24px;">
          <p style="margin:0 0 6px;color:${TEXT_MUTED};font-size:12px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">Proprietário</p>
          <h2 style="margin:0 0 14px;color:${TEXT_DARK};font-size:22px;font-weight:700;">${escapeHtml(data.owner_name)}</h2>
          <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:15px;color:${TEXT_MID};">
            <tr><td style="padding:3px 0;">✉ <a href="mailto:${escapeHtml(data.owner_email)}" style="color:${BRAND_BLUE_LIGHT};text-decoration:none;">${escapeHtml(data.owner_email)}</a></td></tr>
            ${data.owner_phone ? `<tr><td style="padding:3px 0;">📞 ${escapeHtml(data.owner_phone)}</td></tr>` : ""}
          </table>
        </td></tr>
      </table>
    </td></tr>

    <!-- Property -->
    ${sectionTitle("Imóvel", data.property_nickname || "Sem apelido")}
    <tr><td style="padding:0 32px;">
      <p style="margin:0 0 18px;color:${TEXT_DARK};font-size:16px;line-height:1.5;font-weight:500;">📍 ${escapeHtml(data.property_address)}</p>
      ${statBlocks([
        { label: "Quartos", value: data.bedrooms_count },
        { label: "Suítes", value: data.suites_count },
        { label: "Banheiros", value: data.bathrooms_count },
        { label: "Salas", value: data.living_rooms_count },
        { label: "Capacidade", value: `${data.max_capacity} pessoas` },
        { label: "Garagem", value: `${data.parking_spots} ${data.parking_spots === 1 ? "vaga" : "vagas"}` },
      ])}
    </td></tr>

    <!-- Estrutura -->
    ${sectionTitle("Estrutura do imóvel")}
    <tr><td style="padding:0 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${statRow("Pavimentos do imóvel", data.property_levels)}
        ${statRow("Andar do apartamento", data.apartment_floor ?? "—")}
        ${statRow("Elevador", fmtBool(data.has_elevator))}
        ${statRow("Wi-Fi", fmtBool(data.has_wifi))}
        ${statRow("Experiência com Airbnb", airbnbStatus)}
      </table>
    </td></tr>

    <!-- Rooms -->
    ${sectionTitle("Cômodos por pavimento", `${rooms.length} ${rooms.length === 1 ? "ambiente no total" : "ambientes no total"}`)}
    <tr><td style="padding:0 32px;">${roomsHtml}</td></tr>

    <!-- Kitchen -->
    ${sectionTitle("Cozinha", "Itens disponíveis")}
    <tr><td style="padding:0 32px;">${pillList(data.kitchen_items || [])}</td></tr>

    <!-- Special amenities -->
    ${sectionTitle("Comodidades do imóvel")}
    <tr><td style="padding:0 32px;">${pillList(data.special_amenities || [])}</td></tr>

    <!-- Condo amenities -->
    ${sectionTitle("Comodidades do condomínio")}
    <tr><td style="padding:0 32px;">${pillList(data.condo_amenities || [])}</td></tr>

    ${data.notes ? `
    ${sectionTitle("Observações do proprietário")}
    <tr><td style="padding:0 32px;">
      <div style="background:${BG_SOFT};border-left:3px solid ${BRAND_TERRA};padding:18px 20px;border-radius:0 10px 10px 0;color:${TEXT_DARK};font-size:15px;line-height:1.7;white-space:pre-wrap;">${escapeHtml(data.notes)}</div>
    </td></tr>` : ""}

    <!-- CTA -->
    <tr><td style="padding:36px 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td align="center" style="padding:24px;background:${BG_SOFT};border-radius:12px;">
          <p style="margin:0 0 16px;color:${TEXT_MID};font-size:15px;">Acesse o painel para revisar e dar sequência ao cadastro</p>
          <a href="${portalUrl}/admin/cadastros-proprietarios" style="display:inline-block;background:${BRAND_TERRA};color:#fff;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">Ver no painel →</a>
        </td></tr>
      </table>
      <p style="margin:18px 0 0;color:${TEXT_MUTED};font-size:12px;text-align:center;">ID da submissão: ${escapeHtml(submissionId)}</p>
    </td></tr>
  `;

  return emailShell({
    preheader: `Nova ficha técnica de ${data.owner_name} — ${data.property_address}`,
    heading: "Nova ficha técnica recebida",
    subheading: `${data.owner_name} • ${data.property_nickname || "Sem apelido"}`,
    bodyHtml: body,
  });
}

function buildOwnerWelcomeHtml(name: string, magicLink: string | null) {
  const body = `
    <tr><td style="padding:36px 32px 8px;">
      <h2 style="margin:0 0 12px;color:${TEXT_DARK};font-size:20px;font-weight:600;">Olá, ${escapeHtml(name)} 👋</h2>
      <p style="margin:0 0 16px;color:${TEXT_MID};font-size:15px;line-height:1.6;">
        Recebemos sua ficha com sucesso! Nossa equipe está analisando os detalhes do seu imóvel e entraremos em contato em breve para agendar uma conversa e apresentar os próximos passos da parceria.
      </p>
    </td></tr>

    ${magicLink ? `
    <tr><td style="padding:8px 32px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG_SOFT};border:1px solid ${BORDER};border-radius:12px;">
        <tr><td style="padding:24px;text-align:center;">
          <p style="margin:0 0 6px;color:${BRAND_BLUE};font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Acesso ao portal</p>
          <p style="margin:0 0 18px;color:${TEXT_MID};font-size:14px;line-height:1.5;">Já criamos seu acesso. Defina sua senha para acompanhar tudo em um só lugar.</p>
          <a href="${magicLink}" style="display:inline-block;background:${BRAND_TERRA};color:#fff;padding:13px 32px;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Definir minha senha</a>
        </td></tr>
      </table>
    </td></tr>` : ""}

    <tr><td style="padding:28px 32px;">
      <p style="margin:0;color:${TEXT_MUTED};font-size:13px;line-height:1.6;">
        Se tiver qualquer dúvida, basta responder este e-mail. Estamos à disposição!
      </p>
    </td></tr>
  `;

  return emailShell({
    preheader: "Recebemos sua ficha — em breve entraremos em contato",
    heading: "Recebemos sua ficha 🎉",
    subheading: "Sua proposta de parceria está em análise",
    bodyHtml: body,
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

    // --- Modo TESTE: ?test=1 envia uma amostra para os admins, sem persistir nada ---
    const url = new URL(req.url);
    if (url.searchParams.get("test") === "1") {
      if (!RESEND_API_KEY) {
        return new Response(JSON.stringify({ error: "RESEND_API_KEY não configurada" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const samplePayload: IntakePayload = {
        owner_name: "Maria Exemplo (TESTE)",
        owner_email: "exemplo@rios.test",
        owner_phone: "(11) 98765-4321",
        property_address: "Rua das Tulipas, 180 — Apto 404, Pinheiros, São Paulo/SP",
        property_nickname: "Tulipas 404",
        bedrooms_count: 2,
        living_rooms_count: 1,
        bathrooms_count: 2,
        suites_count: 1,
        building_floors: 12,
        apartment_floor: 4,
        property_levels: 1,
        has_elevator: true,
        has_wifi: true,
        max_capacity: 5,
        parking_spots: 1,
        rooms_data: [
          { name: "Suíte master", floor: 1, beds: [{ type: "Casal", count: 1 }], hasAC: true, hasTV: true, hasBalcony: true },
          { name: "Quarto 2", floor: 1, beds: [{ type: "Solteiro", count: 2 }], hasAC: true },
          { name: "Sala de estar", floor: 1, beds: [{ type: "Sofá-cama", count: 1 }], hasTV: true, hasBalcony: true },
        ],
        kitchen_items: ["Geladeira", "Fogão 4 bocas", "Microondas", "Cafeteira", "Liquidificador", "Jogo de panelas"],
        special_amenities: ["Ar-condicionado em todos os quartos", "Smart TV", "Roupa de cama premium"],
        condo_amenities: ["Piscina", "Academia", "Churrasqueira", "Portaria 24h"],
        notes: "Imóvel reformado em 2024. Disponível a partir de janeiro.\nPreferência por estadias acima de 3 noites.",
        previously_listed_airbnb: false,
      };
      const adminHtml = buildAdminEmailHtml(samplePayload, "TESTE-" + crypto.randomUUID().slice(0, 8), PORTAL_URL);
      const validAdminEmails = ADMIN_NOTIFY_EMAILS.filter((value) => isValidEmail(value));
      const recipients = validAdminEmails.length > 0 ? validAdminEmails : ["rioslagoon@gmail.com"];
      const subject = "🧪 [TESTE] Pré-visualização da ficha técnica — RIOS";

      const results = await Promise.all(recipients.map(async (to) => {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({ from: MAIL_FROM, to: [to], subject, html: adminHtml }),
        });
        const body = await res.text();
        return { to, status: res.status, ok: res.ok, body };
      }));

      return new Response(JSON.stringify({ test: true, recipients, results }, null, 2), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
