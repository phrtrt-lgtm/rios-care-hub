import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerateRequest {
  templateKey?: string;
  action?: string;
  context?: any;
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

    const { templateKey, action, context, ticketId, chargeId, customInstructions }: GenerateRequest = await req.json();

    // Handle new action-based requests
    if (action) {
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      
      if (!LOVABLE_API_KEY) {
        throw new Error('LOVABLE_API_KEY not configured');
      }

      let systemPrompt = '';
      let userPrompt = '';

      switch (action) {
        case 'generate_proposal':
          systemPrompt = `Você é um assistente especializado em criar descrições profissionais e claras para votações e propostas relacionadas a melhorias em imóveis de hospedagem.
          
O contexto do projeto: ${context.projectContext}

Diretrizes:
- Escreva em português brasileiro
- Seja claro, objetivo e profissional
- Foque nos benefícios e justificativas
- Use 2-4 parágrafos
- Não use jargão técnico desnecessário`;
          userPrompt = context.prompt;
          break;
        
        case 'generate_alert':
          systemPrompt = `Você é um assistente especializado em criar mensagens profissionais e claras para alertas e comunicações com proprietários de imóveis de hospedagem.
          
O contexto do projeto: Sistema de gestão de hospedagens RIOS - comunicação com proprietários e equipe sobre avisos, informações e alertas importantes.

Diretrizes:
- Escreva em português brasileiro
- Seja claro, objetivo e profissional
- Use tom apropriado ao tipo de alerta
- Use 2-4 parágrafos
- Seja direto e não prolixo
- Termine com orientações claras quando necessário`;
          userPrompt = context.prompt;
          break;
        
        case 'generate_ticket':
          systemPrompt = `Você é um assistente especializado em criar descrições profissionais e claras para chamados/tickets relacionados a imóveis de hospedagem.
          
O contexto do projeto: Sistema de gestão de hospedagens RIOS - criação de tickets para proprietários sobre manutenção, dúvidas, informações e outros assuntos.

Diretrizes:
- Escreva em português brasileiro
- Seja claro, objetivo e profissional
- Foque no problema/assunto e na solução/ação esperada
- Use 2-4 parágrafos
- Não use jargão técnico desnecessário
- Seja específico sobre o que está sendo comunicado`;
          userPrompt = context.prompt;
          break;
        
        default:
          throw new Error('Invalid action');
      }

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: 'Limite de requisições excedido. Tente novamente em alguns instantes.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (response.status === 402) {
          return new Response(
            JSON.stringify({ error: 'Créditos insuficientes. Por favor, adicione créditos ao workspace.' }),
            { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const errorText = await response.text();
        console.error('AI gateway error:', response.status, errorText);
        throw new Error('AI gateway error');
      }

      const data = await response.json();
      const generatedText = data.choices?.[0]?.message?.content;

      return new Response(
        JSON.stringify({ generatedText }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Original template-based logic
    if (!templateKey) {
      throw new Error('templateKey or action required');
    }

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
    let contextStr = "";

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
        contextStr = `
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

      // Buscar mensagens da cobrança
      const { data: chargeMessages } = await supabaseClient
        .from("charge_messages")
        .select(`
          *,
          profiles(name, role)
        `)
        .eq("charge_id", chargeId)
        .order("created_at", { ascending: true });

      const messagesHistory = chargeMessages?.map(m => 
        `${m.profiles.name} (${m.profiles.role === 'owner' ? 'Proprietário' : 'Equipe'}): ${m.body}`
      ).join('\n') || '';

      if (charge) {
        const amountBRL = new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: charge.currency || "BRL",
        }).format(charge.amount_cents / 100);

        contextStr = `
CONTEXTO DA EMPRESA:
A RIOS é uma empresa de Operação e Gestão de Hospedagens que administra imóveis de aluguel por temporada. Oferecemos gestão completa de propriedades.

IMPORTANTE SOBRE COBRANÇAS:
- TODAS as cobranças são criadas PELA EQUIPE RIOS, NUNCA pelo proprietário
- O proprietário está recebendo esta cobrança da RIOS por serviços prestados, manutenções realizadas, ou despesas relacionadas ao seu imóvel
- Não trate como se o proprietário estivesse cobrando algo da RIOS
- A RIOS está cobrando o proprietário, não o contrário

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

HISTÓRICO DA CONVERSA:
${messagesHistory}

ORIENTAÇÕES PARA RESPOSTA:
- Lembre-se: você está respondendo EM NOME DA RIOS para o proprietário
- Seja claro sobre o motivo da cobrança
- Se houver dúvidas sobre a cobrança, explique detalhadamente
- Mencione prazos de contestação se relevante (7 dias corridos após recebimento)
- Seja cordial mas profissional
`;
      }
    }

    // Build final prompt
    const systemPrompt = `${aiSettings.system_prompt}

${aiSettings.style_guide ? `GUIA DE ESTILO:\n${aiSettings.style_guide}\n` : ""}

${aiSettings.guardrails ? `REGRAS DE SEGURANÇA:\n${aiSettings.guardrails}\n` : ""}`;

    const userPrompt = `${contextStr}

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
