import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerateRequest {
  templateKey: string;
  ticketId?: string;
  chargeId?: string;
  customInstructions?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // Verify user is team member
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    console.log("User profile:", { userId: user.id, profile });

    if (!profile || !["admin", "agent"].includes(profile.role)) {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { templateKey, ticketId, chargeId, customInstructions }: GenerateRequest = await req.json();

    // Get AI settings
    const { data: aiSettings } = await supabaseClient
      .from("ai_settings")
      .select("*")
      .single();

    if (!aiSettings) {
      return new Response(
        JSON.stringify({ error: "AI settings not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get template
    console.log("Fetching template with key:", templateKey);
    const { data: template, error: templateError } = await supabaseClient
      .from("ai_templates")
      .select("*")
      .eq("key", templateKey)
      .eq("enabled", true)
      .single();

    console.log("Template query result:", { template, templateError });

    if (templateError || !template) {
      console.error("Template error:", templateError);
      return new Response(
        JSON.stringify({ 
          error: "Template not found or disabled",
          details: templateError?.message,
          templateKey 
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build context
    let context = "";

    if (ticketId) {
      const { data: ticket } = await supabaseClient
        .from("tickets")
        .select(`
          *,
          owner:profiles!tickets_owner_id_fkey(name, email, phone),
          property:properties(name, address)
        `)
        .eq("id", ticketId)
        .single();

      // Buscar mensagens do ticket
      const { data: ticketMessages } = await supabaseClient
        .from("ticket_messages")
        .select(`
          *,
          profiles(name, role)
        `)
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });

      const messagesHistory = ticketMessages?.map(m => 
        `${m.profiles.name} (${m.profiles.role === 'owner' ? 'Proprietário' : 'Equipe'}): ${m.body}`
      ).join('\n') || '';

      if (ticket) {
        context = `
CONTEXTO DA EMPRESA:
A RIOS é uma empresa de Operação e Gestão de Hospedagens que administra imóveis de aluguel por temporada. Oferecemos gestão completa de propriedades, incluindo:
- Gestão de reservas e check-in/check-out
- Manutenção e limpeza profissional
- Suporte 24/7 aos proprietários
- Gestão financeira e repasses
- Marketing e divulgação dos imóveis

CONTEXTO DO TICKET:
- ID: ${ticket.id}
- Assunto: ${ticket.subject}
- Descrição: ${ticket.description}
- Status: ${ticket.status}
- Prioridade: ${ticket.priority}
- Tipo: ${ticket.ticket_type}
- Criado em: ${new Intl.DateTimeFormat("pt-BR").format(new Date(ticket.created_at))}
- Proprietário: ${ticket.owner?.name} (${ticket.owner?.email})${ticket.owner?.phone ? ` - Tel: ${ticket.owner.phone}` : ''}
- Propriedade: ${ticket.property?.name}${ticket.property?.address ? ` - ${ticket.property.address}` : ''}
${ticket.blocked_dates_start ? `- Período de bloqueio solicitado: ${new Intl.DateTimeFormat("pt-BR").format(new Date(ticket.blocked_dates_start))} a ${new Intl.DateTimeFormat("pt-BR").format(new Date(ticket.blocked_dates_end!))}` : ''}

HISTÓRICO DA CONVERSA:
${messagesHistory}
`;
      }
    }

    if (chargeId) {
      const { data: charge } = await supabaseClient
        .from("charges")
        .select(`
          *,
          owner:profiles!charges_owner_id_fkey(name, email),
          ticket:tickets(subject, property:properties(name))
        `)
        .eq("id", chargeId)
        .single();

      if (charge) {
        const amountBRL = new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: charge.currency || "BRL",
        }).format(charge.amount_cents / 100);

        context = `
CONTEXTO DA COBRANÇA:
- ID: ${charge.id}
- Título: ${charge.title}
- Descrição: ${charge.description || "N/A"}
- Valor: ${amountBRL}
- Vencimento: ${charge.due_date ? new Intl.DateTimeFormat("pt-BR").format(new Date(charge.due_date)) : "N/A"}
- Status: ${charge.status}
- Proprietário: ${charge.owner?.name} (${charge.owner?.email})
${charge.ticket ? `- Relacionado ao ticket: ${charge.ticket.subject}` : ""}
${charge.ticket?.property ? `- Propriedade: ${charge.ticket.property.name}` : ""}
${charge.payment_link_url ? `- Link de pagamento: ${charge.payment_link_url}` : ""}
`;
      }
    }

    // Build final prompt
    const systemPrompt = `${aiSettings.system_prompt}

${aiSettings.style_guide ? `GUIA DE ESTILO:\n${aiSettings.style_guide}\n` : ""}

${aiSettings.guardrails ? `REGRAS DE SEGURANÇA:\n${aiSettings.guardrails}\n` : ""}`;

    const userPrompt = `${context}

${customInstructions ? `INSTRUÇÕES DO ATENDENTE:\n${customInstructions}\n\n` : ''}${template.template_prompt}

IMPORTANTE: 
- Responda sempre em PT-BR, de forma direta e profissional
- Use o contexto da RIOS e do histórico da conversa
- Mantenha 2-4 parágrafos no máximo
- Não invente informações que não estão no contexto
- Assine como "— Equipe RIOS"`;

    // Call Lovable AI
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ error: "Lovable AI not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiSettings.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: aiSettings.temperature,
        max_tokens: aiSettings.max_tokens,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("Lovable AI error:", aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds to your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      throw new Error(`AI API error: ${aiResponse.status} - ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const generatedText = aiData.choices?.[0]?.message?.content || "";

    const latency = Date.now() - startTime;

    // Log usage
    await supabaseClient.from("ai_usage_logs").insert({
      ticket_id: ticketId || null,
      charge_id: chargeId || null,
      template_key: templateKey,
      request_tokens: aiData.usage?.prompt_tokens || 0,
      response_tokens: aiData.usage?.completion_tokens || 0,
      model: aiSettings.model,
      latency_ms: latency,
      created_by: user.id,
      success: true,
    });

    return new Response(
      JSON.stringify({ text: generatedText }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in ai-generate-response:", error);

    // Try to log error
    try {
      const supabaseClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      const {
        data: { user },
      } = await supabaseClient.auth.getUser();

      if (user) {
        await supabaseClient.from("ai_usage_logs").insert({
          created_by: user.id,
          success: false,
          error: error.message,
          model: "unknown",
          latency_ms: Date.now() - startTime,
        });
      }
    } catch (logError) {
      console.error("Failed to log error:", logError);
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
