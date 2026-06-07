import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { messages } = await req.json();

    // ── Fetch all relevant data from the database ──────────────────────────
    const today = new Date().toISOString().split("T")[0];
    const in90days = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const [
      ticketsRes,
      chargesRes,
      propertiesRes,
      inspectionsRes,
      bookingCommissionsRes,
      proposalsRes,
      profilesRes,
      propertyFilesRes,
    ] = await Promise.all([
      // All non-closed tickets with property and owner info
      supabase
        .from("tickets")
        .select("id, subject, status, priority, ticket_type, cost_responsible, created_at, updated_at, properties(name), profiles:owner_id(name)")
        .not("status", "in", '("concluido","cancelado")')
        .order("created_at", { ascending: false })
        .limit(150),

      // Open charges with owner and property info
      supabase
        .from("charges")
        .select("id, title, status, amount_cents, due_date, created_at, category, service_type, split_owner_percent, management_contribution_cents, profiles:owner_id(name), properties(name)")
        .not("status", "in", '("pago_no_vencimento","pago_com_atraso","debited")')
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(100),

      // All properties with owner info
      supabase
        .from("properties")
        .select("id, name, address, profiles:owner_id(name, email, phone, payment_score)")
        .order("name"),

      // Recent inspections (last 30 days)
      supabase
        .from("cleaning_inspections")
        .select("id, created_at, is_routine, internal_only, cleaner_name, notes, transcript_summary, properties(name)")
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(60),

      // Open booking commissions
      supabase
        .from("booking_commissions")
        .select("id, status, check_in, check_out, guest_name, commission_cents, total_due_cents, due_date, created_at, profiles:owner_id(name), properties(name)")
        .not("status", "in", '("pago","debited","arquivado")')
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(60),

      // Active proposals/votações
      supabase
        .from("proposals")
        .select("id, title, description, status, deadline, target_audience, category, created_at, properties(name)")
        .eq("status", "active")
        .order("deadline", { ascending: true })
        .limit(30),

      // All active profiles (owners, team)
      supabase
        .from("profiles")
        .select("id, name, email, role, status, payment_score, phone")
        .eq("status", "active")
        .order("name"),

      // Fichas (property_files) — documentação interna em markdown por imóvel
      supabase
        .from("property_files")
        .select("property_id, content_md, version, updated_at"),
    ]);

    const tickets = ticketsRes.data || [];
    const charges = chargesRes.data || [];
    const properties = propertiesRes.data || [];
    const inspections = inspectionsRes.data || [];
    const bookingCommissions = bookingCommissionsRes.data || [];
    const proposals = proposalsRes.data || [];
    const profiles = profilesRes.data || [];
    let reservations: any[] = [];
    const propertyFiles = propertyFilesRes.data || [];
    // Hostex é a única fonte: todos os imóveis podem ser consultados sobre datas.
    const propertiesWithIcal = new Set<string>(properties.map((p: any) => p.id));
    const propertyNamesWithIcal = new Set<string>(properties.map((p: any) => p.name));

    // ── Hostex (fonte primária) ────────────────────────────────────────────
    // 1) Lê direto do cache local `hostex_reservations` (sincronizado a cada 6h).
    // 2) Se cache vazio, chama o proxy ao vivo.
    // 3) Se tudo falhar, usa o fallback iCal já carregado em `reservations`.
    let reservationsSource: "hostex_cache" | "hostex_cache_stale" | "hostex_live" | "ical_fallback" = "ical_fallback";
    let hostexEnriched: any[] = [];
    let hostexSyncedAt: string | null = null;
    try {
      const horizon = new Date(Date.now() + 120 * 86400000).toISOString().split("T")[0];
      const past = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

      // 1) cache local
      const cacheRes = await supabase
        .from("hostex_reservations")
        .select("reservation_code, property_id, property_id_hostex, channel_type, check_in_date, check_out_date, guests, status, guest_name, total_rate_cents, total_commission_cents, synced_at")
        .gte("check_out_date", past)
        .lte("check_in_date", horizon)
        .neq("status", "cancelled")
        .order("check_in_date", { ascending: true })
        .limit(5000);

      let list: any[] = cacheRes.data ?? [];
      if (list.length > 0) {
        const latest = list.reduce((acc: string | null, r: any) =>
          !acc || (r.synced_at && r.synced_at > acc) ? r.synced_at : acc, null as string | null);
        hostexSyncedAt = latest;
        const ageHours = latest ? (Date.now() - new Date(latest).getTime()) / 3600000 : 999;
        reservationsSource = ageHours > 12 ? "hostex_cache_stale" : "hostex_cache";
      } else {
        // 2) proxy ao vivo
        const proxyResp = await fetch(`${supabaseUrl}/functions/v1/hostex-proxy`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
            apikey: supabaseKey,
          },
          body: JSON.stringify({
            action: "search_reservations",
            params: { start_date: past, end_date: horizon },
          }),
        });
        if (proxyResp.ok) {
          const proxyJson = await proxyResp.json();
          const src = proxyJson.source as string | undefined;
          if (src === "hostex_cache" || src === "hostex_cache_stale" || src === "hostex_live") {
            reservationsSource = src as any;
          }
          hostexSyncedAt = proxyJson.synced_at ?? proxyJson.data?.synced_at ?? null;
          list = proxyJson.data?.reservations ?? proxyJson.data?.data?.reservations ?? [];
        }
      }

      if (list.length > 0) {
        hostexEnriched = list;
        const propByName = new Map<string, any>(properties.map((p: any) => [p.name, p]));
        const propById = new Map<string, any>(properties.map((p: any) => [String(p.id), p]));
        reservations = list.map((r: any) => {
          const propIdKey = String(r.property_id ?? r.property_id_hostex ?? "");
          const prop = propById.get(propIdKey) ?? propByName.get(r.property_name ?? "");
          return {
            id: r.reservation_code,
            check_in: r.check_in_date,
            check_out: r.check_out_date,
            guest_name: r.guest_name,
            summary: r.guest_name,
            status: r.status ?? "confirmed",
            properties: { name: prop?.name ?? r.property_name ?? "Imóvel" },
            _hostex: r,
          };
        });
      }
    } catch (e) {
      console.warn("ai-consulta: hostex unavailable, using iCal fallback", e);
    }

    const isHostex = reservationsSource !== "ical_fallback";

    // Se Hostex está ativa, todos os imóveis podem ser consultados sobre datas
    if (isHostex) {
      for (const p of properties) {
        propertiesWithIcal.add((p as any).id);
        propertyNamesWithIcal.add((p as any).name);
      }
    }

    // ── Build structured context ──────────────────────────────────────────
    const owners = profiles.filter((p: any) => p.role === "owner");
    const teamMembers = profiles.filter((p: any) => ["admin", "agent", "maintenance"].includes(p.role));

    const ctx: string[] = [];

    // Properties summary
    ctx.push(`=== IMÓVEIS CADASTRADOS (${properties.length}) ===`);
    for (const p of properties) {
      const owner = (p.profiles as any);
      ctx.push(`• ${p.name} | Proprietário: ${owner?.name || "?"} | Tel: ${owner?.phone || "?"} | Score pagamento: ${owner?.payment_score ?? "?"}`);
    }

    // Team members
    ctx.push(`\n=== EQUIPE RIOS (${teamMembers.length} membros) ===`);
    for (const t of teamMembers) {
      const roleLabel: Record<string, string> = { admin: "Admin", agent: "Agente", maintenance: "Manutenção" };
      ctx.push(`• ${t.name} | Função: ${roleLabel[t.role] || t.role} | Email: ${t.email}`);
    }

    // Owners summary
    ctx.push(`\n=== PROPRIETÁRIOS ATIVOS (${owners.length}) ===`);
    for (const o of owners) {
      ctx.push(`• ${o.name} | Email: ${o.email} | Tel: ${o.phone || "?"} | Score: ${o.payment_score ?? 100}`);
    }

    // Tickets/Maintenance grouped by status
    const byStatus: Record<string, typeof tickets> = {};
    for (const t of tickets) {
      if (!byStatus[t.status]) byStatus[t.status] = [];
      byStatus[t.status].push(t);
    }
    ctx.push(`\n=== CHAMADOS/MANUTENÇÕES ABERTOS (${tickets.length} total) ===`);
    for (const [status, items] of Object.entries(byStatus)) {
      ctx.push(`\n[Status: ${status.toUpperCase()}] (${items.length} chamados)`);
      for (const t of items) {
        const propName = (t.properties as any)?.name || "Sem imóvel";
        const ownerName = (t.profiles as any)?.name || "?";
        const priority = t.priority === "urgente" ? "🔴 URGENTE" : "normal";
        ctx.push(`  • [${propName}] ${t.subject} | Proprietário: ${ownerName} | Prioridade: ${priority} | Tipo: ${t.ticket_type} | Custo: ${t.cost_responsible || "?"}`);
      }
    }

    // Charges
    ctx.push(`\n=== COBRANÇAS EM ABERTO (${charges.length}) ===`);
    for (const c of charges) {
      const propName = (c.properties as any)?.name || "Sem imóvel";
      const ownerName = (c.profiles as any)?.name || "?";
      const value = (c.amount_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const contrib = c.management_contribution_cents > 0
        ? ` | Aporte gestão: ${(c.management_contribution_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
        : "";
      ctx.push(`  • ${c.title} | Imóvel: ${propName} | Proprietário: ${ownerName} | Valor: ${value}${contrib} | Status: ${c.status} | Vencimento: ${c.due_date || "?"} | Categoria: ${c.category || c.service_type || "?"}`);
    }

    // Inspections
    ctx.push(`\n=== VISTORIAS RECENTES (${inspections.length}) ===`);
    for (const ins of inspections) {
      const propName = (ins.properties as any)?.name || "Sem imóvel";
      const type = ins.is_routine ? "Rotina" : "Limpeza";
      const visibility = ins.internal_only ? "Interna" : "Visível ao proprietário";
      const date = new Date(ins.created_at).toLocaleDateString("pt-BR");
      const summary = ins.transcript_summary ? ` | Resumo: ${ins.transcript_summary.slice(0, 120)}...` : "";
      ctx.push(`  • [${propName}] Tipo: ${type} | Data: ${date} | Faxineira: ${ins.cleaner_name || "?"} | ${visibility}${summary}`);
    }

    // Booking Commissions
    ctx.push(`\n=== COMISSÕES BOOKING EM ABERTO (${bookingCommissions.length}) ===`);
    for (const bc of bookingCommissions) {
      const propName = (bc.properties as any)?.name || "Sem imóvel";
      const ownerName = (bc.profiles as any)?.name || "?";
      const total = (bc.total_due_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      ctx.push(`  • [${propName}] Hóspede: ${bc.guest_name || "?"} | Check-in: ${bc.check_in} | Check-out: ${bc.check_out} | Proprietário: ${ownerName} | Total: ${total} | Status: ${bc.status} | Vencimento: ${bc.due_date || "?"}`);
    }

    // Proposals/Votações
    ctx.push(`\n=== VOTAÇÕES/PROPOSTAS ATIVAS (${proposals.length}) ===`);
    for (const pr of proposals) {
      const propName = (pr.properties as any)?.name || "Todos os proprietários";
      ctx.push(`  • ${pr.title} | Imóvel: ${propName} | Prazo: ${pr.deadline} | Categoria: ${pr.category || "?"} | Público: ${pr.target_audience}`);
    }

    // Reservations grouped by property with gap analysis
    const resByProp: Record<string, any[]> = {};
    for (const r of reservations) {
      const propName = (r.properties as any)?.name || "Sem imóvel";
      if (!resByProp[propName]) resByProp[propName] = [];
      resByProp[propName].push(r);
    }

    // Helper: is property occupied on a given date?
    const isOccupied = (rList: any[], date: string) =>
      rList.some((r) => r.check_in <= date && r.check_out > date);

    // Helper: next checkout date if occupied today
    const currentCheckout = (rList: any[], date: string) =>
      rList.find((r) => r.check_in <= date && r.check_out > date)?.check_out ?? null;

    // Format YYYY-MM-DD → DD/MM/YYYY
    const toBR = (d: string) => {
      if (!d) return d;
      const [y, m, day] = d.split("T")[0].split("-");
      return `${day}/${m}/${y}`;
    };

    const normalizeText = (value: string) =>
      value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

    const monthMap: Record<string, number> = {
      janeiro: 1,
      fevereiro: 2,
      marco: 3,
      abril: 4,
      maio: 5,
      junho: 6,
      julho: 7,
      agosto: 8,
      setembro: 9,
      outubro: 10,
      novembro: 11,
      dezembro: 12,
    };

    const parseDateFromQuestion = (value: string): string | null => {
      const normalized = normalizeText(value);
      const currentYear = new Date().getFullYear();

      const slashMatch = normalized.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
      if (slashMatch) {
        const day = Number(slashMatch[1]);
        const month = Number(slashMatch[2]);
        const yearRaw = slashMatch[3] ? Number(slashMatch[3]) : currentYear;
        const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
          return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
        }
      }

      const textMatch = normalized.match(/\b(\d{1,2})\s+de\s+([a-zç]+)(?:\s+de\s+(\d{4}))?\b/);
      if (textMatch) {
        const day = Number(textMatch[1]);
        const month = monthMap[textMatch[2].replace("ç", "c")];
        const year = textMatch[3] ? Number(textMatch[3]) : currentYear;
        if (day >= 1 && day <= 31 && month) {
          return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
        }
      }

      return null;
    };

    ctx.push(`\n=== CALENDÁRIO DE RESERVAS – PRÓXIMOS 90 DIAS (hoje: ${toBR(today)}) ===`);
    ctx.push(`Fonte: ${isHostex ? `Hostex (${reservationsSource}${hostexSyncedAt ? `, sincronizado em ${new Date(hostexSyncedAt).toLocaleString("pt-BR")}` : ""})` : "iCal fallback"}. ${isHostex ? "Todos os imóveis têm dados de reservas via Hostex." : "Apenas imóveis com iCal configurado têm dados de reservas/disponibilidade. Imóveis sem iCal NÃO devem ser consultados sobre datas."}`);
    ctx.push(`REGRA CRÍTICA – NÃO ALUCINAR DATAS: Liste APENAS as reservas (📅) e janelas (⬜) explicitamente presentes abaixo. NUNCA invente reservas, janelas, períodos ou datas que não estejam literalmente listadas. Todas as datas estão no formato BR (DD/MM/AAAA) — use sempre esse formato nas respostas. Se após a última reserva listada (marcada como "FIM DAS RESERVAS") não houver mais nada, o imóvel está TOTALMENTE LIVRE a partir do checkout daquela última reserva — responda exatamente isso, sem fragmentar em sub-períodos fictícios.\n`);

    for (const [propName, rList] of Object.entries(resByProp)) {
      // Skip properties without iCal — não temos dados confiáveis de disponibilidade
      if (!propertyNamesWithIcal.has(propName)) continue;
      const occupied = isOccupied(rList, today);
      const checkout = currentCheckout(rList, today);
      const statusLabel = occupied
        ? `🔴 OCUPADO HOJE (checkout: ${toBR(checkout)})`
        : `🟢 DISPONÍVEL HOJE`;

      ctx.push(`\n[${propName}] → STATUS ATUAL: ${statusLabel}`);
      const sorted = rList.sort((a, b) => a.check_in.localeCompare(b.check_in));

      // Show gap from today to first future reservation (if not occupied)
      const futureReservations = sorted.filter((r) => r.check_in > today);
      if (!occupied && futureReservations.length > 0) {
        const nextIn = futureReservations[0].check_in;
        const gapMs = new Date(nextIn).getTime() - new Date(today).getTime();
        const gapDays = Math.round(gapMs / (1000 * 60 * 60 * 24));
        ctx.push(`  ⬜ Livre agora até próxima reserva em ${toBR(nextIn)} (${gapDays} dias)`);
      } else if (!occupied && futureReservations.length === 0) {
        ctx.push(`  ⬜ Sem reservas futuras nos próximos 90 dias`);
      }

      for (let i = 0; i < sorted.length; i++) {
        const r = sorted[i];
        const checkIn = r.check_in;
        const checkOut = r.check_out;
        const isActive = checkIn <= today && checkOut > today;
        const guest = r.guest_name || r.summary || "Bloqueado/Hóspede";
        const activeTag = isActive ? " ← EM ANDAMENTO AGORA" : "";
        ctx.push(`  📅 ${toBR(checkIn)} → ${toBR(checkOut)} | ${guest}${activeTag}`);

        // Calculate gap to next reservation
        if (i < sorted.length - 1) {
          const nextIn = sorted[i + 1].check_in;
          const gapMs = new Date(nextIn).getTime() - new Date(checkOut).getTime();
          const gapDays = Math.round(gapMs / (1000 * 60 * 60 * 24));
          if (gapDays > 0) {
            ctx.push(`  ⬜ Janela livre: ${toBR(checkOut)} → ${toBR(nextIn)} (${gapDays} dias)`);
          }
      }
      const lastCheckout = sorted.length > 0 ? sorted[sorted.length - 1].check_out : null;
      if (lastCheckout) {
        ctx.push(`  ⛔ FIM DAS RESERVAS conhecidas — a partir de ${toBR(lastCheckout)} o imóvel está TOTALMENTE LIVRE (sem mais reservas nos próximos 90 dias).`);
      }
    }
    }


    // Properties with no reservations at all (only show those WITH iCal — sem iCal não temos dados)
    for (const p of properties) {
      const pname = (p as any).name;
      if (!resByProp[pname] && propertyNamesWithIcal.has(pname)) {
        ctx.push(`\n[${pname}] → STATUS ATUAL: 🟢 DISPONÍVEL HOJE\n  ⬜ Sem reservas nos próximos 90 dias`);
      }
    }

    // List properties WITHOUT iCal so the AI knows it cannot answer date queries for them
    const noIcalProps = properties.filter((p: any) => !propertiesWithIcal.has(p.id)).map((p: any) => p.name);
    if (noIcalProps.length > 0) {
      ctx.push(`\n=== IMÓVEIS SEM iCAL CONFIGURADO (${noIcalProps.length}) ===`);
      ctx.push(`Para os imóveis abaixo NÃO há sincronização de calendário. NÃO responda perguntas sobre disponibilidade, ocupação, datas livres, próximas reservas ou janelas — informe que esses imóveis não possuem iCal configurado:`);
      for (const n of noIcalProps) ctx.push(`  • ${n}`);
    }

    // ── Fichas dos imóveis (markdown) ─────────────────────────────────────
    // Documentação técnica/operacional de cada unidade: wifi, chaves, comodidades,
    // instruções, particularidades. Truncamos em ~3500 chars por ficha.
    const fichasComConteudo = propertyFiles.filter(
      (f: any) => f.content_md && f.content_md.trim().length > 0
    );
    if (fichasComConteudo.length > 0) {
      ctx.push(
        `\n=== FICHAS DOS IMÓVEIS – DOCUMENTAÇÃO INTERNA (${fichasComConteudo.length}) ===`
      );
      ctx.push(
        `Use estas fichas SEMPRE que perguntarem sobre detalhes operacionais de um imóvel: wifi, senhas, chaves, código do portão, comodidades, instruções para hóspedes, peculiaridades, fornecedores, etc. Se a informação solicitada existir aqui, responda diretamente citando a fonte (ex.: "Conforme a ficha do imóvel X..."). Se não existir, diga que a ficha não tem aquela informação e sugira atualizar.\n`
      );
      for (const f of fichasComConteudo) {
        const prop = properties.find((p: any) => p.id === (f as any).property_id);
        const propName = (prop as any)?.name || "Imóvel desconhecido";
        const content = (f as any).content_md as string;
        const truncated =
          content.length > 3500 ? content.slice(0, 3500) + "\n...[ficha truncada — consulte o portal para ver completa]" : content;
        ctx.push(`\n--- FICHA: ${propName} (v${(f as any).version}) ---\n${truncated}\n--- FIM DA FICHA: ${propName} ---`);
      }
    }

    const lastUserMessage = [...messages].reverse().find((m: any) => m.role === "user" && typeof m.content === "string")?.content || "";
    const normalizedQuestion = normalizeText(lastUserMessage);
    const isAvailabilityQuestion = /(dispon|livre|reserva|ocupad|calend|janela|vaga|check\s?-?in|check\s?-?out|data)/.test(normalizedQuestion);
    const mentionedProperty = properties
      .map((p: any) => ({ ...p, normalizedName: normalizeText(p.name || "") }))
      .sort((a, b) => b.normalizedName.length - a.normalizedName.length)
      .find((p) => p.normalizedName && normalizedQuestion.includes(p.normalizedName));

    if (isAvailabilityQuestion && mentionedProperty) {
      const propertyName = mentionedProperty.name;
      const hasIcal = propertiesWithIcal.has(mentionedProperty.id);

      if (!hasIcal) {
        return new Response(JSON.stringify({
          reply: `O imóvel ${propertyName} não tem calendário sincronizado no sistema, então eu não consigo confirmar disponibilidade com segurança.`,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const propertyReservations = [...(resByProp[propertyName] || [])].sort((a, b) => a.check_in.localeCompare(b.check_in));
      const askedDate = parseDateFromQuestion(lastUserMessage);

      if (askedDate) {
        const activeReservation = propertyReservations.find((r) => r.check_in <= askedDate && r.check_out > askedDate);
        const nextReservation = propertyReservations.find((r) => r.check_in > askedDate);

        if (activeReservation) {
          return new Response(JSON.stringify({
            reply: `No dia ${toBR(askedDate)}, o imóvel ${propertyName} está ocupado pela reserva real de ${toBR(activeReservation.check_in)} até ${toBR(activeReservation.check_out)}.`,
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const nextText = nextReservation
          ? ` A próxima reserva real começa em ${toBR(nextReservation.check_in)}.`
          : ` Não há reservas futuras nos próximos 90 dias após essa data.`;

        return new Response(JSON.stringify({
          reply: `No dia ${toBR(askedDate)}, o imóvel ${propertyName} está livre.${nextText}`,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const occupiedToday = isOccupied(propertyReservations, today);
      const todayCheckout = currentCheckout(propertyReservations, today);
      const futureReservations = propertyReservations.filter((r) => r.check_in > today);

      if (!occupiedToday && futureReservations.length === 0) {
        return new Response(JSON.stringify({
          reply: `O imóvel ${propertyName} está totalmente livre. Hoje (${toBR(today)}) ele está disponível e não há nenhuma reserva real nos próximos 90 dias.`,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (occupiedToday && futureReservations.length === 0) {
        return new Response(JSON.stringify({
          reply: `O imóvel ${propertyName} está ocupado hoje e o checkout atual é em ${toBR(todayCheckout)}. Depois disso, ele fica totalmente livre, sem outras reservas reais nos próximos 90 dias.`,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!occupiedToday && futureReservations.length > 0) {
        const nextReservation = futureReservations[0];
        const reservationsPreview = futureReservations
          .slice(0, 3)
          .map((r) => `• ${toBR(r.check_in)} → ${toBR(r.check_out)}`)
          .join("\n");

        return new Response(JSON.stringify({
          reply: `O imóvel ${propertyName} está livre hoje (${toBR(today)}) e segue disponível até ${toBR(nextReservation.check_in)}. Reservas reais já registradas:\n${reservationsPreview}`,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const reservationsPreview = futureReservations
        .slice(0, 3)
        .map((r) => `• ${toBR(r.check_in)} → ${toBR(r.check_out)}`)
        .join("\n");

      return new Response(JSON.stringify({
        reply: `O imóvel ${propertyName} está ocupado hoje e o checkout atual é em ${toBR(todayCheckout)}. Próximas reservas reais já registradas:\n${reservationsPreview}`,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── System Prompt ─────────────────────────────────────────────────────
    const systemPrompt = `Você é o assistente interno da RIOS – Operação e Gestão de Hospedagens.

## SOBRE A RIOS
A RIOS é uma empresa de gestão de hospedagens por temporada. Gerenciamos imóveis de proprietários que são alugados para hóspedes em plataformas como Airbnb, Booking, etc. Os calendários de reservas são sincronizados via iCal das plataformas (Airbnb, Booking.com, etc.) automaticamente.

## NOSSAS OPERAÇÕES PRINCIPAIS
1. **Chamados/Manutenções**: Problemas nos imóveis relatados por hóspedes ou proprietários. Têm tipos (manutenção, limpeza, informação, financeiro, etc.), prioridades (normal/urgente) e responsáveis de custo (proprietário ou gestão).
2. **Cobranças**: Valores a serem pagos pelos proprietários para manutenções, serviços, taxas. Podem ter aporte da gestão (a RIOS cobre parte do valor).
3. **Vistorias**: Inspeções nos imóveis feitas após limpeza. Registram o estado do imóvel, problemas encontrados e comunicam ao proprietário quando relevante.
4. **Comissões Booking**: Cobrança das comissões de reservas feitas pelas plataformas (Airbnb, etc.) que são devidas pelos proprietários à RIOS.
5. **Votações/Propostas**: Consultas enviadas aos proprietários para aprovação de melhorias, compras coletivas ou decisões sobre os imóveis.
6. **Score de Pagamento**: Proprietários têm uma pontuação (0-100+) que reflete seu histórico de pagamentos. Score alto = bom pagador.
7. **Reservas/Calendário**: Todas as reservas são sincronizadas via links iCal das plataformas. Janelas livres entre reservas são oportunidades para manutenção.
8. **Fichas dos Imóveis**: Cada unidade tem uma ficha em markdown com documentação operacional (wifi, chaves, código do portão, comodidades, instruções, particularidades). Use-as como fonte primária para perguntas técnicas/operacionais sobre um imóvel específico.

## FLUXO DE ATENDIMENTO
- Chamados chegam com status: novo → em_andamento → aguardando → concluido/cancelado
- Cobranças: draft → pendente → enviado → pago_no_vencimento/pago_com_atraso/debited/contestado
- Vistorias podem ser rotina (checklist detalhado) ou limpeza simples
- Proprietários aprovam manutenções caras antes de executar
- Manutenções urgentes devem ser agendadas nas janelas livres entre reservas

## EQUIPE
- **Admin**: Acesso total, gerencia tudo
- **Agente**: Atende chamados e cobranças financeiras/comunicação
- **Manutenção**: Executa e acompanha serviços técnicos nos imóveis

## COMO RESPONDER
- Seja direto, objetivo e use os dados abaixo para responder com precisão
- Quando listar itens, use bullet points ou tabelas simples
- Se perguntarem sobre um imóvel específico, filtre pelos dados do imóvel
- Se perguntarem sobre um proprietário, filtre pelos dados do proprietário  
- Indique sempre o status atual e próximos passos quando relevante
- Para cobranças, informe o valor, vencimento e se tem aporte da gestão
- Use emojis com moderação para facilitar a leitura (🔴 urgente, ✅ pago, ⏳ pendente)

## DADOS ATUAIS DO SISTEMA (${new Date().toLocaleDateString("pt-BR")})
FONTE DE RESERVAS: ${isHostex ? `Hostex (${reservationsSource})${hostexSyncedAt ? ` — última sincronização: ${new Date(hostexSyncedAt).toLocaleString("pt-BR")}` : ""}` : "iCal TalkGuest (fallback — Hostex indisponível)"}
${hostexEnriched.length > 0 ? `Reservas Hostex carregadas: ${hostexEnriched.length}. Cite "Fonte: Hostex" ao reportar números financeiros/ocupação.` : ""}

## RESTRIÇÕES (somente leitura)
Você é SOMENTE LEITURA nesta fase. Se o usuário pedir para alterar preço, disponibilidade, criar tarefa, enviar mensagem ou qualquer ação de escrita na Hostex, responda: "Essa ação ainda não está habilitada nesta fase — apenas consultas de leitura estão disponíveis."
Sempre que citar números (receita, ocupação, ADR), indique o período e a fonte (Hostex em tempo real ou iCal fallback).

${ctx.join("\n")}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        max_tokens: 2000,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded", status: 429 }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Payment required", status: 402 }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${status}`);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "Sem resposta.";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-consulta error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
