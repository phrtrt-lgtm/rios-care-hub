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
    const { inspectionId, transcript } = await req.json();

    if (!inspectionId || !transcript) {
      throw new Error('Missing inspectionId or transcript');
    }

    console.log(`Generating summary for inspection ${inspectionId}`);

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
            content: `Você é um especialista em manutenção de imóveis de aluguel de temporada. Analise a transcrição de vistoria e identifique problemas e soluções.

CATEGORIAS DE PROFISSIONAIS (use a categoria correta!):
- 🪟 Vidraceiro: box de banheiro, janelas, espelhos, portas de vidro
- 💧 Encanador/Hidráulica: vazamentos, torneiras, chuveiros (parte hidráulica), canos, ralos
- ⚡ Eletricista: tomadas, interruptores, lâmpadas, fiação, disjuntores
- 🪚 Marceneiro: móveis de madeira, portas, gavetas, armários, dobradiças
- 🔧 Manutenção geral: fechaduras, maçanetas, pequenos reparos
- ❄️ Refrigeração: ar-condicionado, geladeira
- 🧹 Limpeza: sujeira, manchas, limpeza profunda
- 🛒 Compras: itens faltando (pilhas, utensílios, etc)

Formato de resposta:
- Se não houver problemas: "✅ Sem problemas identificados"
- Se houver problemas, liste cada um:
  • [EMOJI] Problema: descrição breve
  • Profissional: tipo específico
  
Seja objetivo e direto. Não repita informações.`
          },
          {
            role: 'user',
            content: `Transcrição do áudio da vistoria:\n\n${transcript}`
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
