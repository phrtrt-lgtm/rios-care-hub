import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get auth user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const reportType = body.report_type || "all";
    const propertyIds = body.property_ids || null; // optional array of property IDs
    const sources = body.sources || ["inspection", "ticket"]; // filter by source
    const sections = body.sections || ["services", "availability", "shopping", "alerts"];

    // 1. Get all properties with addresses
    let propsQuery = supabase.from("properties").select("id, name, address");
    if (propertyIds && propertyIds.length > 0) {
      propsQuery = propsQuery.in("id", propertyIds);
    }
    const { data: properties } = await propsQuery;

    if (!properties || properties.length === 0) {
      return new Response(
        JSON.stringify({ error: "No properties found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allPropertyIds = properties.map((p) => p.id);

    // 2. Get upcoming reservations (next 60 days) to find availability gaps
    const today = new Date().toISOString().split("T")[0];
    const sixtyDays = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const { data: reservations } = await supabase
      .from("reservations")
      .select("property_id, check_in, check_out, guest_name")
      .in("property_id", allPropertyIds)
      .gte("check_out", today)
      .lte("check_in", sixtyDays)
      .order("check_in");

    // 3. Get open maintenance tickets (pending services)
    let tickets: any[] = [];
    if (sources.includes("ticket")) {
      let ticketQuery = supabase
        .from("tickets")
        .select("id, subject, description, property_id, status, priority, kind")
        .in("property_id", allPropertyIds)
        .in("status", ["novo", "em_analise", "aguardando_info", "em_execucao"]);

      const { data } = await ticketQuery;
      tickets = data || [];
    }

    // 4. Get inspection items that need attention
    let inspectionItems: any[] = [];
    if (sources.includes("inspection")) {
      const { data } = await supabase
        .from("inspection_items")
        .select(`
          id, description, category, status,
          inspection:inspection_id (
            property_id,
            created_at
          )
        `)
        .in("status", ["pending", "management", "owner", "guest"]);
      inspectionItems = data || [];
    }

    // 5. Calculate availability windows per property
    const propertyAvailability: Record<string, Array<{ start: string; end: string }>> = {};

    for (const prop of properties) {
      const propReservations = (reservations || [])
        .filter((r) => r.property_id === prop.id)
        .sort((a, b) => a.check_in.localeCompare(b.check_in));

      const gaps: Array<{ start: string; end: string }> = [];
      let currentDate = today;

      for (const res of propReservations) {
        if (res.check_in > currentDate) {
          gaps.push({ start: currentDate, end: res.check_in });
        }
        if (res.check_out > currentDate) {
          currentDate = res.check_out;
        }
      }

      // Gap after last reservation until end of window
      if (currentDate < sixtyDays) {
        gaps.push({ start: currentDate, end: sixtyDays });
      }

      propertyAvailability[prop.id] = gaps;
    }

    // 7. Build context for AI
    const contextParts: string[] = [];

    for (const prop of properties) {
      const propTickets = (tickets || []).filter((t) => t.property_id === prop.id);
      const propInspectionItems = (inspectionItems || []).filter(
        (item: any) => item.inspection?.property_id === prop.id
      );
      const gaps = propertyAvailability[prop.id] || [];

      const nextReservation = (reservations || [])
        .filter((r) => r.property_id === prop.id && r.check_in >= today)
        .sort((a, b) => a.check_in.localeCompare(b.check_in))[0];

      contextParts.push(`
### ${prop.name} (${prop.address || "Sem endereço"})

**Janelas disponíveis (sem hóspede):**
${gaps.length > 0 ? gaps.map((g) => `- ${g.start} a ${g.end}`).join("\n") : "- Nenhuma janela disponível nos próximos 60 dias"}

**Próximo check-in:** ${nextReservation ? `${nextReservation.check_in} (${nextReservation.guest_name || "Hóspede"})` : "Nenhum agendado"}

**Chamados de manutenção pendentes (${propTickets.length}):**
${propTickets.map((t) => `- [${t.priority}] [${t.kind || 'Geral'}] ${t.subject}: ${t.description?.slice(0, 100)}`).join("\n") || "- Nenhum"}

**Itens de vistoria pendentes (${propInspectionItems.length}):**
${propInspectionItems.map((item: any) => `- [${item.category}] ${item.description}`).join("\n") || "- Nenhum"}
`);
    }

    // 8. Call Lovable AI
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serviceTypeFilter = reportType === "all"
      ? "TODOS os tipos de serviço"
      : `o tipo de serviço: ${reportType}`;

    const sectionsToInclude = sections.join(", ");
    console.log("Report context:", {
      properties: properties.length,
      tickets: tickets.length,
      inspectionItems: inspectionItems.length,
      reportType,
      sources,
      sections,
    });

    const aiPrompt = `Você é um assistente de gestão de propriedades de aluguel por temporada. 
Analise os dados abaixo de todas as unidades e gere um relatório estruturado para ${serviceTypeFilter}.
Seções solicitadas: ${sectionsToInclude}

DADOS DAS UNIDADES:
${contextParts.join("\n---\n")}

GERE O RELATÓRIO NO FORMATO JSON com esta estrutura exata:
{
  "service_summaries": [
    {
      "service_type": "Pintura" | "Hidráulica" | "Elétrica" | "Marcenaria" | "Itens" | "Estrutural" | "Refrigeração" | "Limpeza" | "Compras",
      "properties": [
        {
          "name": "Nome da unidade",
          "address": "Endereço",
          "tasks": ["Descrição do serviço 1", "Descrição do serviço 2"],
          "available_dates": [{"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"}],
          "next_guest_checkin": "YYYY-MM-DD ou null",
          "urgency": "alta" | "media" | "baixa"
        }
      ]
    }
  ],
  "shopping_lists": [
    {
      "property_name": "Nome da unidade",
      "property_address": "Endereço",
      "next_checkin": "YYYY-MM-DD ou null",
      "items": ["Item 1", "Item 2"],
      "notes": "Observações relevantes"
    }
  ],
  "alerts": [
    {
      "type": "checkin_soon" | "urgent_maintenance" | "shopping_needed",
      "property_name": "Nome",
      "message": "Descrição do alerta",
      "deadline": "YYYY-MM-DD"
    }
  ]
}

REGRAS:
- Agrupe todos os serviços similares para facilitar envio ao profissional
- Identifique itens que precisam ser comprados antes da próxima reserva
- Gere alertas para check-ins nos próximos 7 dias com pendências
- Priorize serviços urgentes
- Considere janelas de disponibilidade reais (quando não há hóspede)
- Responda APENAS com o JSON, sem texto adicional`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: aiPrompt }],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI API error:", errText);
      throw new Error(`AI API failed [${aiResponse.status}]: ${errText}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || "";

    // Parse AI response (remove potential markdown code blocks)
    let reportData;
    try {
      const cleanJson = aiContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      reportData = JSON.parse(cleanJson);
    } catch {
      console.error("Failed to parse AI response:", aiContent);
      reportData = { raw_response: aiContent, parse_error: true };
    }

    // 9. Store report
    const { data: report, error: reportError } = await supabase
      .from("service_availability_reports")
      .insert({
        report_type: reportType,
        report_data: reportData.service_summaries || reportData,
        shopping_list: reportData.shopping_lists || null,
        generated_by: user.id,
      })
      .select()
      .single();

    if (reportError) {
      console.error("Error saving report:", reportError);
    }

    return new Response(
      JSON.stringify({
        report_id: report?.id,
        ...reportData,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-service-summary error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
