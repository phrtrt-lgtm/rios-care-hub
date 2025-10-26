import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, context } = await req.json();
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    let systemPrompt = "";
    let userPrompt = "";

    // Define prompts based on action
    switch (action) {
      case "generate_response":
        systemPrompt = "Você é um assistente de atendimento ao cliente profissional e empático. Analise o contexto do ticket e gere uma resposta clara, profissional e útil. Seja conciso mas completo. Use um tom cordial e profissional.";
        userPrompt = `Contexto do ticket:
Assunto: ${context.subject}
Descrição: ${context.description}
${context.messages ? `Mensagens anteriores:\n${context.messages}` : ''}

Gere uma resposta apropriada para este ticket.`;
        break;

      case "generate_document":
        systemPrompt = "Você é um especialista em criar documentos profissionais. Crie documentos claros, bem estruturados e profissionais baseados nas informações fornecidas. Use formatação adequada, seja formal e detalhado.";
        userPrompt = `Tipo de documento: ${context.documentType}

Informações do Ticket:
- Assunto: ${context.subject}
- Descrição: ${context.description}
- Propriedade: ${context.propertyName || 'Não especificada'}
- Proprietário: ${context.ownerName}

Histórico de mensagens:
${context.messages}

Gere um ${context.documentType} profissional, completo e bem formatado com base nessas informações. Inclua cabeçalho, corpo estruturado e conclusão apropriados.`;
        break;

      case "summarize":
        systemPrompt = "Você é um assistente especializado em resumir conversas e tickets. Crie resumos concisos e informativos.";
        userPrompt = `Resuma o seguinte ticket e suas mensagens:
Assunto: ${context.subject}
Descrição: ${context.description}
Mensagens: ${context.messages}

Crie um resumo executivo conciso.`;
        break;

      default:
        throw new Error("Ação não reconhecida");
    }

    console.log("Calling OpenAI with action:", action);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini-2025-08-07",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições da OpenAI excedido. Tente novamente em alguns instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`Erro OpenAI: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const generatedText = data.choices[0].message.content;

    console.log("AI response generated successfully");

    return new Response(
      JSON.stringify({ result: generatedText }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in ai-assistant function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
