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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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
        systemPrompt = "Você é um especialista em criar documentos profissionais. Crie documentos claros, bem estruturados e profissionais baseados nas informações fornecidas.";
        userPrompt = `Tipo de documento: ${context.documentType}
Informações: ${context.info}

Gere um documento profissional e bem formatado.`;
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

    console.log("Calling Lovable AI with action:", action);

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
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("Erro ao chamar IA");
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
