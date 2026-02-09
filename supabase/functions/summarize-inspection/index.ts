import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildUserPrompt(transcript: string | null, checklistNotes: Record<string, string> | null): string {
  const parts: string[] = [];

  if (checklistNotes && Object.keys(checklistNotes).length > 0) {
    parts.push("DADOS DO CHECKLIST DE ROTINA:");
    for (const [item, info] of Object.entries(checklistNotes)) {
      parts.push(`- ${item}: ${info}`);
    }
    parts.push("");
  }

  if (transcript) {
    parts.push("TRANSCRIÇÃO DOS ÁUDIOS:");
    parts.push(transcript);
    parts.push("");
  }

  parts.push("Com base nas informações acima (checklist e/ou áudios), faça um resumo dos problemas do imóvel e o que precisamos fazer.");

  return parts.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transcript, inspectionId, checklistNotes } = await req.json();

    if (!transcript && !checklistNotes) {
      return new Response(
        JSON.stringify({ error: "Transcript or checklist notes required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `Você é um assistente especializado em gestão de imóveis de aluguel por temporada (Airbnb).
Sua tarefa é analisar transcrições de áudios enviados por faxineiras após a limpeza e check-out dos imóveis.

OBJETIVO: Criar um resumo claro e objetivo dos problemas encontrados no imóvel.

FORMATO DO RESUMO:
- Liste cada problema identificado em bullet points
- Seja direto e objetivo
- Priorize problemas que precisam de ação imediata
- Identifique se são problemas de manutenção, reposição de itens, ou limpeza adicional
- Se não houver problemas, indique "Imóvel verificado sem problemas."

Não inclua comentários pessoais da faxineira que não sejam relevantes para a gestão do imóvel.`;

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
          { 
            role: "user", 
            content: buildUserPrompt(transcript, checklistNotes),
          },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content || "";

    // If inspectionId provided, update the inspection with the summary
    if (inspectionId) {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const updateResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/cleaning_inspections?id=eq.${inspectionId}`,
          {
            method: "PATCH",
            headers: {
              "apikey": SUPABASE_SERVICE_ROLE_KEY,
              "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              "Content-Type": "application/json",
              "Prefer": "return=minimal",
            },
            body: JSON.stringify({ transcript_summary: summary }),
          }
        );

        if (!updateResponse.ok) {
          console.error("Failed to update inspection:", await updateResponse.text());
        }
      }
    }

    return new Response(
      JSON.stringify({ summary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in summarize-inspection:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
