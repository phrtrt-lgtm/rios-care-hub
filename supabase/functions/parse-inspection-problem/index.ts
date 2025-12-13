import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CATEGORY_PATTERNS = [
  { pattern: /PEDREIRO|ALVENARIA/i, category: 'PEDREIRO/ALVENARIA', emoji: '🧱' },
  { pattern: /VIDRACEIRO/i, category: 'VIDRACEIRO', emoji: '🔷' },
  { pattern: /HIDR[ÁA]ULICA/i, category: 'HIDRÁULICA', emoji: '💧' },
  { pattern: /EL[ÉE]TRICA/i, category: 'ELÉTRICA', emoji: '⚡' },
  { pattern: /MARCENARIA/i, category: 'MARCENARIA', emoji: '🔨' },
  { pattern: /MANUTEN[ÇC][ÃA]O\s*GERAL/i, category: 'MANUTENÇÃO GERAL', emoji: '🔧' },
  { pattern: /REFRIGERA[ÇC][ÃA]O/i, category: 'REFRIGERAÇÃO', emoji: '❄️' },
  { pattern: /LIMPEZA/i, category: 'LIMPEZA', emoji: '🧹' },
  { pattern: /ITENS|REPOSI[ÇC][ÃA]O|COMPRAS/i, category: 'ITENS/REPOSIÇÃO', emoji: '📦' },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { problemText } = await req.json();

    if (!problemText || typeof problemText !== 'string' || !problemText.trim()) {
      throw new Error('Missing or empty problemText');
    }

    console.log('Parsing problem text:', problemText);

    // Call Lovable AI to categorize the problem
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `Você é um especialista em manutenção de imóveis. Analise o texto do problema e retorne um JSON com a categoria e descrição corrigida.

CATEGORIAS DISPONÍVEIS:
- PEDREIRO/ALVENARIA: reparos em paredes, reboco, tapar buracos, dutos de ar (parte estrutural), azulejos, rejunte
- VIDRACEIRO: box de banheiro, janelas de vidro, espelhos, portas de vidro
- HIDRÁULICA: vazamentos, torneiras, chuveiros, canos, ralos, entupimentos
- ELÉTRICA: tomadas, interruptores, lâmpadas, fiação, disjuntores
- MARCENARIA: móveis de madeira, portas de madeira, gavetas, armários, dobradiças
- MANUTENÇÃO GERAL: fechaduras, maçanetas, pequenos reparos diversos
- REFRIGERAÇÃO: ar-condicionado (parte mecânica/gás), geladeira
- LIMPEZA: sujeira, manchas, limpeza profunda necessária
- ITENS/REPOSIÇÃO: itens faltando ou para repor

REGRAS:
- Tapar buraco/duto de ar-condicionado na parede = PEDREIRO/ALVENARIA
- Problema no funcionamento do ar-condicionado = REFRIGERAÇÃO
- Reparo em estrutura de vidro = VIDRACEIRO

Retorne APENAS um JSON válido no formato:
{"category": "CATEGORIA", "description": "Descrição clara e concisa do problema"}`
          },
          {
            role: 'user',
            content: problemText
          }
        ],
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      throw new Error(`AI API error: ${errorText}`);
    }

    const result = await response.json();
    const aiResponse = result.choices?.[0]?.message?.content?.trim() || '';

    console.log('AI response:', aiResponse);

    // Try to parse the JSON response
    let parsedItem: { category: string; description: string };
    
    try {
      // Extract JSON from the response (it might have extra text around it)
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedItem = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response, using fallback:', parseError);
      // Fallback: use the original text and try to categorize based on keywords
      parsedItem = {
        category: 'MANUTENÇÃO GERAL',
        description: problemText.trim()
      };
      
      // Try to match category from keywords
      const upperText = problemText.toUpperCase();
      for (const { pattern, category } of CATEGORY_PATTERNS) {
        if (pattern.test(upperText)) {
          parsedItem.category = category;
          break;
        }
      }
    }

    // Find the emoji for the category
    let emoji = '🔧';
    for (const { pattern, emoji: catEmoji } of CATEGORY_PATTERNS) {
      if (pattern.test(parsedItem.category)) {
        emoji = catEmoji;
        break;
      }
    }

    console.log('Parsed item:', parsedItem, 'emoji:', emoji);

    return new Response(
      JSON.stringify({ 
        success: true, 
        item: {
          category: parsedItem.category,
          description: parsedItem.description,
          emoji
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error parsing problem:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
