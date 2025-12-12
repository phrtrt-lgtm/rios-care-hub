import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { inspectionId, transcript, extraPrompt } = await req.json();

    if (!inspectionId || !transcript) {
      throw new Error('Missing inspectionId or transcript');
    }

    console.log(`Generating summary for inspection ${inspectionId}`, extraPrompt ? `with extra prompt: ${extraPrompt}` : '');

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    // Generate AI summary
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
        messages: [
          {
            role: 'system',
            content: `Você é um especialista em manutenção de imóveis de aluguel de temporada. Analise a transcrição de vistoria e AGRUPE os problemas por CATEGORIA/TIPO DE SERVIÇO.

CATEGORIAS (AGRUPE TODOS OS ITENS DE CADA CATEGORIA JUNTOS):

🧱 PEDREIRO/ALVENARIA: reparos em paredes, reboco, tapar buracos, dutos de ar (parte estrutural), azulejos, rejunte, pequenas obras
🔷 VIDRACEIRO: box de banheiro, janelas de vidro, espelhos, portas de vidro
💧 HIDRÁULICA: vazamentos, torneiras, chuveiros, canos, ralos, entupimentos, caixa d'água
⚡ ELÉTRICA: tomadas, interruptores, lâmpadas, fiação, disjuntores
🔨 MARCENARIA: móveis de madeira, portas de madeira, gavetas, armários, dobradiças de móveis
🔧 MANUTENÇÃO GERAL: fechaduras, maçanetas, pequenos reparos diversos
❄️ REFRIGERAÇÃO: ar-condicionado (parte mecânica/gás), geladeira
🧹 LIMPEZA: sujeira, manchas, limpeza profunda necessária
🛒 COMPRAS: itens faltando ou para repor (pilhas, utensílios, produtos, etc)

REGRAS IMPORTANTES:
- Tapar buraco/duto de ar-condicionado na parede = PEDREIRO (não refrigeração)
- Problema no funcionamento do ar-condicionado = REFRIGERAÇÃO
- Reparo em estrutura = PEDREIRO
- Reparo em vidro = VIDRACEIRO

FORMATO DE RESPOSTA:
Se não houver problemas: "✅ Sem problemas identificados"

Se houver problemas, agrupe assim (IMPORTANTE - use EXATAMENTE estes emojis):
🧱 PEDREIRO/ALVENARIA:
• Item 1
• Item 2

💧 HIDRÁULICA:
• Item 1

(Liste APENAS as categorias que têm problemas. Seja breve e direto.)`
          },
          {
            role: 'user',
            content: `Transcrição do áudio da vistoria:\n\n${transcript}${extraPrompt ? `\n\nINSTRUÇÕES ADICIONAIS DO USUÁRIO: ${extraPrompt}` : ''}`
          }
        ],
        max_completion_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${errorText}`);
    }

    const result = await response.json();
    const summary = result.choices?.[0]?.message?.content?.trim() || '';

    if (!summary) {
      throw new Error('No summary generated');
    }

    console.log('Summary generated, updating database...');

    // Update the inspection in the database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error: updateError } = await supabase
      .from('cleaning_inspections')
      .update({ transcript_summary: summary })
      .eq('id', inspectionId);

    if (updateError) {
      console.error('Database update error:', updateError);
      throw updateError;
    }

    console.log('Summary saved successfully');

    return new Response(
      JSON.stringify({ success: true, summary }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating summary:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
