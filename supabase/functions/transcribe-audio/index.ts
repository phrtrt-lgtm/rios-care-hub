import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Process base64 in chunks to prevent memory issues
function processBase64Chunks(base64String: string, chunkSize = 32768) {
  const chunks: Uint8Array[] = [];
  let position = 0;
  
  while (position < base64String.length) {
    const chunk = base64String.slice(position, position + chunkSize);
    const binaryChunk = atob(chunk);
    const bytes = new Uint8Array(binaryChunk.length);
    
    for (let i = 0; i < binaryChunk.length; i++) {
      bytes[i] = binaryChunk.charCodeAt(i);
    }
    
    chunks.push(bytes);
    position += chunkSize;
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

// Generate AI summary from transcript
async function generateSummary(transcript: string): Promise<string> {
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAIApiKey || !transcript || transcript.trim().length < 10) {
    return '';
  }

  try {
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
      console.error('OpenAI API error for summary:', response.status);
      return '';
    }

    const result = await response.json();
    return result.choices?.[0]?.message?.content?.trim() || '';
  } catch (error) {
    console.error('Error generating summary:', error);
    return '';
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { audio, mimeType } = await req.json();
    
    if (!audio) {
      throw new Error('No audio data provided');
    }

    console.log('Processing audio transcription, mimeType:', mimeType);
    
    // Process audio in chunks
    const binaryAudio = processBase64Chunks(audio);
    console.log('Binary audio size:', binaryAudio.length, 'bytes');
    
    // Prepare form data
    const formData = new FormData();
    const blob = new Blob([binaryAudio], { type: mimeType || 'audio/webm' });
    formData.append('file', blob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt'); // Portuguese

    // Send to OpenAI Whisper
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${errorText}`);
    }

    const result = await response.json();
    const transcriptText = result.text || '';
    console.log('Transcription successful, text length:', transcriptText.length);

    // Generate AI summary
    console.log('Generating AI summary...');
    const summary = await generateSummary(transcriptText);
    console.log('Summary generated, length:', summary.length);

    return new Response(
      JSON.stringify({ 
        text: transcriptText,
        summary: summary 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Transcription error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
