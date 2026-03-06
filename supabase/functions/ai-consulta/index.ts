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

    // Fetch current data to give context to the AI
    const [ticketsRes, chargesRes, propertiesRes] = await Promise.all([
      supabase
        .from("tickets")
        .select("id, subject, status, priority, ticket_type, cost_responsible, created_at, properties(name)")
        .not("status", "in", '("concluido","cancelado")')
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("charges")
        .select("id, title, status, amount_cents, due_date, created_at, profiles(name), properties(name)")
        .not("status", "in", '("pago_no_vencimento","pago_com_atraso","debited")')
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("properties")
        .select("id, name, owner_id")
        .order("name"),
    ]);

    const tickets = ticketsRes.data || [];
    const charges = chargesRes.data || [];
    const properties = propertiesRes.data || [];

    // Build context summary
    const ticketsByProperty: Record<string, typeof tickets> = {};
    for (const t of tickets) {
      const propName = (t.properties as any)?.name || "Sem imóvel";
      if (!ticketsByProperty[propName]) ticketsByProperty[propName] = [];
      ticketsByProperty[propName].push(t);
    }

    const contextLines: string[] = [];
    contextLines.push(`=== IMÓVEIS (${properties.length}) ===`);
    for (const p of properties) contextLines.push(`- ${p.name}`);

    contextLines.push(`\n=== MANUTENÇÕES/CHAMADOS PENDENTES (${tickets.length}) ===`);
    for (const [propName, pts] of Object.entries(ticketsByProperty)) {
      contextLines.push(`\n[${propName}]`);
      for (const t of pts) {
        const status = t.status;
        const priority = t.priority === "urgente" ? "🔴 URGENTE" : "normal";
        contextLines.push(
          `  • ${t.subject} | Status: ${status} | Prioridade: ${priority} | Tipo: ${t.ticket_type} | Responsável custo: ${t.cost_responsible || "?"}`
        );
      }
    }

    contextLines.push(`\n=== COBRANÇAS EM ABERTO (${charges.length}) ===`);
    for (const c of charges) {
      const propName = (c.properties as any)?.name || "Sem imóvel";
      const ownerName = (c.profiles as any)?.name || "?";
      const value = (c.amount_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      contextLines.push(
        `  • ${c.title} | Imóvel: ${propName} | Proprietário: ${ownerName} | Valor: ${value} | Status: ${c.status} | Vencimento: ${c.due_date || "?"}`
      );
    }

    const systemPrompt = `Você é o assistente interno da RIOS – Operação e Gestão de Hospedagens.
Responda em português, de forma direta e clara. Você tem acesso aos dados atualizados do sistema.
Se perguntarem sobre manutenções, imóveis, cobranças ou vistorias, use os dados abaixo.
Se a pergunta não for sobre os dados, responda de forma geral mas mantendo o contexto da gestão de hospedagens.

DADOS ATUAIS DO SISTEMA:
${contextLines.join("\n")}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
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
