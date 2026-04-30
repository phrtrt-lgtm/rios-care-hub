import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { renderTemplate, getTemplate } from "../_shared/template-renderer.ts";

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

// ===== Design tokens (RIOS brand) — usados apenas no e-mail de boas-vindas do proprietário =====
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

/**
 * Converte o markdown da ficha em HTML estilizado — IDÊNTICO ao usado em
 * notify-ticket (atualização de anúncio), garantindo a mesma identidade visual.
 */
function markdownToStyledHtml(md: string): string {
  if (!md || !md.trim()) return "";

  const inline = (s: string) =>
    escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#0f3150;">$1</strong>')
      .replace(/(^|\s)_([^_\n]+)_/g, '$1<em style="color:#475569;">$2</em>');

  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;

  type ListItem = { text: string; children: ListItem[] };
  const flushList = (items: ListItem[]) => {
    if (!items.length) return "";
    const renderItems = (arr: ListItem[]): string =>
      arr
        .map(
          (it) =>
            `<li style="margin:4px 0;">${inline(it.text)}${
              it.children.length
                ? `<ul style="margin:6px 0 0;padding-left:20px;color:#475569;">${renderItems(
                    it.children,
                  )}</ul>`
                : ""
            }</li>`,
        )
        .join("");
    return `<ul style="margin:8px 0 14px;padding-left:22px;color:#1f2937;font-size:14px;line-height:22px;">${renderItems(
      items,
    )}</ul>`;
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    if (!line.trim()) {
      i++;
      continue;
    }

    if (/^##\s+/.test(line)) {
      out.push(
        `<h2 style="margin:18px 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:24px;color:#0f3150;border-bottom:2px solid #d36b4d;padding-bottom:6px;">${inline(
          line.replace(/^##\s+/, ""),
        )}</h2>`,
      );
      i++;
      continue;
    }

    if (/^###\s+/.test(line)) {
      out.push(
        `<h3 style="margin:18px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#0f3150;background:#f0f4f9;padding:8px 12px;border-left:3px solid #d36b4d;border-radius:4px;">${inline(
          line.replace(/^###\s+/, ""),
        )}</h3>`,
      );
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(
        `<blockquote style="margin:12px 0;padding:10px 14px;background:#fff7f3;border-left:4px solid #d36b4d;border-radius:6px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#7a3d28;">${inline(
          quoteLines.join(" ").trim(),
        )}</blockquote>`,
      );
      continue;
    }

    if (/^\s*-\s+/.test(line)) {
      const items: ListItem[] = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        const cur = lines[i];
        const indent = cur.match(/^(\s*)/)?.[1].length ?? 0;
        const text = cur.replace(/^\s*-\s+/, "");
        if (indent >= 2 && items.length) {
          items[items.length - 1].children.push({ text, children: [] });
        } else {
          items.push({ text, children: [] });
        }
        i++;
      }
      out.push(flushList(items));
      continue;
    }

    out.push(
      `<p style="margin:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#1f2937;">${inline(
        line,
      )}</p>`,
    );
    i++;
  }

  return out.join("\n");
}

/**
 * Monta a ficha completa em markdown — mesmo padrão visual da atualização de anúncio.
 */
function buildIntakeMarkdown(data: IntakePayload): string {
  const fmtBool = (v: boolean) => (v ? "Sim" : "Não");
  const rooms = (data.rooms_data as Array<{
    name?: string;
    type?: string;
    floor?: number;
    beds?: Array<{ type: string; count: number }>;
    hasAC?: boolean;
    hasTV?: boolean;
    hasBalcony?: boolean;
    hasOutdoorArea?: boolean;
  }>) || [];

  const airbnbStatus =
    data.previously_listed_airbnb === true
      ? "Sim — já tem experiência"
      : data.previously_listed_airbnb === false
        ? "Não — primeira vez"
        : "Não informado";

  // Agrupa cômodos por pavimento
  const roomsByFloor = new Map<number, typeof rooms>();
  rooms.forEach((r) => {
    const floor = r.floor ?? 1;
    if (!roomsByFloor.has(floor)) roomsByFloor.set(floor, []);
    roomsByFloor.get(floor)!.push(r);
  });
  const sortedFloors = Array.from(roomsByFloor.keys()).sort((a, b) => a - b);

  const floorLabel = (floor: number) => {
    if (floor === 0) return "Térreo";
    if (floor === 1 && data.property_levels === 1) return "Pavimento único";
    return `${floor}º Pavimento`;
  };

  const roomsBlock = rooms.length
    ? sortedFloors
        .map((floor) => {
          const floorRooms = roomsByFloor.get(floor)!;
          const items = floorRooms
            .map((r, i) => {
              const beds = (r.beds || [])
                .map((b) => `  - ${b.count}× ${b.type}`)
                .join("\n");
              const features = [
                r.hasAC && "Ar-condicionado",
                r.hasTV && "TV",
                r.hasBalcony && "Varanda",
                r.hasOutdoorArea && "Área externa",
              ].filter(Boolean) as string[];
              const featuresLine = features.length
                ? `\n  Comodidades: ${features.join(" · ")}`
                : "";
              return `- **${r.name || `Cômodo ${i + 1}`}**${featuresLine}\n${beds || "  - _Sem camas informadas_"}`;
            })
            .join("\n");
          return `**${floorLabel(floor)}** _(${floorRooms.length} ${floorRooms.length === 1 ? "ambiente" : "ambientes"})_\n${items}`;
        })
        .join("\n\n")
    : "_Nenhum cômodo cadastrado._";

  const listOrEmpty = (arr: string[]) =>
    arr && arr.length ? arr.map((i) => `- ${i}`).join("\n") : "_Nenhum item informado._";

  const ownerNotes = data.notes?.trim()
    ? `\n> 💬 _Observação do proprietário:_ ${data.notes.trim().replace(/\n+/g, " ")}\n`
    : "";

  return `## 🏠 Nova ficha técnica recebida

**Proprietário:** ${data.owner_name}
**E-mail:** ${data.owner_email}
${data.owner_phone ? `**Telefone:** ${data.owner_phone}\n` : ""}

### 📍 Imóvel
- **Endereço:** ${data.property_address}
- **Apelido:** ${data.property_nickname || "—"}

### 📊 Dimensões
- Quartos: **${data.bedrooms_count}**
- Suítes: **${data.suites_count}**
- Banheiros: **${data.bathrooms_count}**
- Salas: **${data.living_rooms_count}**
- Capacidade: **${data.max_capacity} pessoas**
- Garagem: **${data.parking_spots} ${data.parking_spots === 1 ? "vaga" : "vagas"}**

### 🏢 Estrutura
- Pavimentos do imóvel: **${data.property_levels}**
- Andar do apartamento: **${data.apartment_floor ?? "—"}**
- Elevador: **${fmtBool(data.has_elevator)}**
- Wi-Fi: **${fmtBool(data.has_wifi)}**
- Experiência com Airbnb: **${airbnbStatus}**

### 🛏️ Cômodos por pavimento
${roomsBlock}

### 🍳 Cozinha
${listOrEmpty(data.kitchen_items)}

### ✨ Comodidades do imóvel
${listOrEmpty(data.special_amenities)}

### 🏊 Comodidades do condomínio
${listOrEmpty(data.condo_amenities)}
${ownerNotes}`;
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

  return `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Recebemos sua ficha</title>
</head>
<body style="margin:0;padding:0;background:${BG_PAGE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${TEXT_DARK};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Recebemos sua ficha — em breve entraremos em contato</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG_PAGE};padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:${BG_CARD};border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(15,49,80,0.06);">
      <tr><td style="background:${BRAND_BLUE};padding:36px 32px;text-align:center;">
        <div style="display:inline-block;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:6px 14px;margin-bottom:16px;">
          <span style="color:#fff;font-size:11px;font-weight:600;letter-spacing:0.18em;">RIOS HOSPEDAGENS</span>
        </div>
        <h1 style="margin:0;color:#fff;font-size:22px;font-weight:600;line-height:1.3;">Recebemos sua ficha 🎉</h1>
        <p style="margin:10px 0 0;color:rgba(255,255,255,0.78);font-size:14px;">Sua proposta de parceria está em análise</p>
        <div style="height:3px;width:48px;background:${BRAND_TERRA};margin:18px auto 0;border-radius:2px;"></div>
      </td></tr>
      ${body}
      <tr><td style="background:#f0f2f7;padding:24px 32px;text-align:center;border-top:1px solid ${BORDER};">
        <p style="margin:0 0 6px;color:${TEXT_DARK};font-size:13px;font-weight:600;">Equipe RIOS</p>
        <p style="margin:0;color:${TEXT_MUTED};font-size:12px;line-height:1.5;">Operação e Gestão de Hospedagens<br><a href="https://portal.rioshospedagens.com.br" style="color:${BRAND_BLUE_LIGHT};text-decoration:none;">portal.rioshospedagens.com.br</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

/**
 * Renderiza o e-mail admin usando o MESMO template `ticket_created_team`
 * utilizado no fluxo de Atualização de Anúncio.
 */
async function buildAdminEmailFromTicketTemplate(
  supabase: any,
  data: IntakePayload,
  submissionId: string,
  portalUrl: string,
): Promise<{ subject: string; html: string } | null> {
  const template = await getTemplate(supabase, "ticket_created_team");
  if (!template) {
    console.error("[email] template ticket_created_team não encontrado");
    return null;
  }

  const propertyName = data.property_nickname || data.property_address;
  const subject = `[Cadastro] ${propertyName}`;
  const description = buildIntakeMarkdown(data);

  const variables = {
    owner_name: data.owner_name,
    owner_email: data.owner_email,
    ticket_id: submissionId,
    ticket_id_short: submissionId.slice(0, 8),
    ticket_subject: subject,
    ticket_type: "cadastro_imovel",
    ticket_priority: "Normal",
    ticket_priority_badge: "Normal",
    ticket_description: description,
    ticket_description_html: markdownToStyledHtml(description),
    property_name: propertyName,
    property_address: data.property_address,
    sla_time: "—",
    created_date: new Date().toLocaleString("pt-BR"),
    ticket_url: `${portalUrl}/admin/cadastros-proprietarios`,
  };

  return {
    subject: renderTemplate(template.subject, variables),
    html: renderTemplate(template.body_html, variables),
  };
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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
        building_floors: null,
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
      const submissionId = "TESTE-" + crypto.randomUUID().slice(0, 8);
      const adminEmail = await buildAdminEmailFromTicketTemplate(supabase, samplePayload, submissionId, PORTAL_URL);
      if (!adminEmail) {
        return new Response(JSON.stringify({ error: "Template ticket_created_team não encontrado" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const validAdminEmails = ADMIN_NOTIFY_EMAILS.filter((value) => isValidEmail(value));
      const recipients = validAdminEmails.length > 0 ? validAdminEmails : ["rioslagoon@gmail.com"];
      const subject = "🧪 [TESTE] " + adminEmail.subject;

      const results = await Promise.all(recipients.map(async (to) => {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({ from: MAIL_FROM, to: [to], subject, html: adminEmail.html }),
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

    // Senha temporária aleatória — usada só pra login automático nesta sessão.
    // O proprietário definirá a senha definitiva depois (quando a equipe liberar).
    const tempPassword = `Rios-${crypto.randomUUID()}`;

    // --- Tenta criar usuário (perfil será criado automaticamente como pending_owner pelo trigger) ---
    let userId: string | null = null;
    let magicLink: string | null = null;
    let isExistingUser = false;

    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { name: payload.owner_name, phone: payload.owner_phone || null },
    });

    if (createErr) {
      const msg = createErr.message || "";
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        isExistingUser = true;
        const { data: existing } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", email)
          .maybeSingle();
        userId = existing?.id ?? null;
        console.log("User already exists, linking to existing profile:", userId);

        // Reseta a senha temporária para conseguirmos logar agora
        if (userId) {
          const { error: updErr } = await supabase.auth.admin.updateUserById(userId, {
            password: tempPassword,
          });
          if (updErr) console.error("Error resetting temp password:", updErr);
        }
      } else {
        console.error("Error creating user:", createErr);
      }
    } else {
      userId = created.user?.id ?? null;
    }

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
      const adminEmail = await buildAdminEmailFromTicketTemplate(supabase, payload, submission.id, PORTAL_URL);
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

      if (adminEmail && validAdminEmails.length > 0) {
        const adminResults = await Promise.all(
          validAdminEmails.map((adminEmail2) => sendEmail(adminEmail2, adminEmail.subject, adminEmail.html)),
        );
        console.log("[email] admin send summary:", adminResults);
      } else if (!adminEmail) {
        console.error("[email] adminEmail é null — template ticket_created_team não encontrado");
      } else {
        console.warn("[email] ADMIN_NOTIFY_EMAILS vazio — nenhuma notificação admin será enviada");
      }
      await sendEmail(email, "Recebemos sua ficha — RIOS Hospedagens", ownerHtml);
    } else {
      console.warn("[email] RESEND_API_KEY not set, skipping email send");
    }

    return new Response(
      JSON.stringify({
        success: true,
        submission_id: submission.id,
        auto_login: userId ? { email, password: tempPassword } : null,
      }),
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
