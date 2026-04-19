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
      reservationsRes,
      propertyFilesRes,
      icalLinksRes,
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

      // Reservations (next 90 days + recent past 30 days) for availability/gaps
      supabase
        .from("reservations")
        .select("id, check_in, check_out, guest_name, summary, status, properties(name)")
        .gte("check_out", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])
        .lte("check_in", in90days)
        .order("check_in", { ascending: true })
        .limit(300),

      // Fichas (property_files) — documentação interna em markdown por imóvel
      supabase
        .from("property_files")
        .select("property_id, content_md, version, updated_at"),

      // iCal links — só consultamos datas/disponibilidade de imóveis com iCal configurado
      supabase
        .from("property_ical_links")
        .select("property_id"),
    ]);

    const tickets = ticketsRes.data || [];
    const charges = chargesRes.data || [];
    const properties = propertiesRes.data || [];
    const inspections = inspectionsRes.data || [];
    const bookingCommissions = bookingCommissionsRes.data || [];
    const proposals = proposalsRes.data || [];
    const profiles = profilesRes.data || [];
    const reservations = reservationsRes.data || [];
    const propertyFiles = propertyFilesRes.data || [];
    const icalLinks = icalLinksRes.data || [];
    const propertiesWithIcal = new Set<string>(icalLinks.map((l: any) => l.property_id));
    const propertyNamesWithIcal = new Set<string>(
      properties.filter((p: any) => propertiesWithIcal.has(p.id)).map((p: any) => p.name)
    );

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

    ctx.push(`\n=== CALENDÁRIO DE RESERVAS – PRÓXIMOS 90 DIAS (hoje: ${today}) ===`);
    ctx.push(`IMPORTANTE: "OCUPADO HOJE" significa que existe uma reserva ativa cobrindo a data de hoje. "DISPONÍVEL" significa que não há nenhuma reserva cobrindo hoje.\n`);

    for (const [propName, rList] of Object.entries(resByProp)) {
      const occupied = isOccupied(rList, today);
      const checkout = currentCheckout(rList, today);
      const statusLabel = occupied
        ? `🔴 OCUPADO HOJE (checkout: ${checkout})`
        : `🟢 DISPONÍVEL HOJE`;

      ctx.push(`\n[${propName}] → STATUS ATUAL: ${statusLabel}`);
      const sorted = rList.sort((a, b) => a.check_in.localeCompare(b.check_in));

      // Show gap from today to first future reservation (if not occupied)
      const futureReservations = sorted.filter((r) => r.check_in > today);
      if (!occupied && futureReservations.length > 0) {
        const nextIn = futureReservations[0].check_in;
        const gapMs = new Date(nextIn).getTime() - new Date(today).getTime();
        const gapDays = Math.round(gapMs / (1000 * 60 * 60 * 24));
        ctx.push(`  ⬜ Livre agora até próxima reserva em ${nextIn} (${gapDays} dias)`);
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
        ctx.push(`  📅 ${checkIn} → ${checkOut} | ${guest}${activeTag}`);

        // Calculate gap to next reservation
        if (i < sorted.length - 1) {
          const nextIn = sorted[i + 1].check_in;
          const gapMs = new Date(nextIn).getTime() - new Date(checkOut).getTime();
          const gapDays = Math.round(gapMs / (1000 * 60 * 60 * 24));
          if (gapDays > 0) {
            ctx.push(`  ⬜ Janela livre: ${checkOut} → ${nextIn} (${gapDays} dias)`);
          }
        }
      }
    }

    // Properties with no reservations at all
    for (const p of properties) {
      if (!resByProp[(p as any).name]) {
        ctx.push(`\n[${(p as any).name}] → STATUS ATUAL: 🟢 DISPONÍVEL HOJE\n  ⬜ Sem reservas nos próximos 90 dias`);
      }
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
