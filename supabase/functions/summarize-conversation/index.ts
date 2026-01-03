import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticketId } = await req.json();

    if (!ticketId) {
      throw new Error('ticketId is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch ticket info
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select(`
        id, subject, description, status, ticket_type, created_at,
        properties(name),
        profiles:owner_id(name)
      `)
      .eq('id', ticketId)
      .single();

    if (ticketError) throw ticketError;

    // Fetch all messages
    const { data: messages, error: messagesError } = await supabase
      .from('ticket_messages')
      .select(`
        body, created_at, is_internal,
        profiles:author_id(name, role)
      `)
      .eq('ticket_id', ticketId)
      .eq('is_internal', false)
      .order('created_at', { ascending: true });

    if (messagesError) throw messagesError;

    if (!messages || messages.length < 3) {
      return new Response(
        JSON.stringify({ error: 'Poucas mensagens para resumir' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format conversation for AI
    const conversationText = messages.map((msg: any) => {
      const authorName = msg.profiles?.name || 'Desconhecido';
      const role = msg.profiles?.role === 'owner' ? 'Proprietário' : 'Equipe';
      return `[${role} - ${authorName}]: ${msg.body}`;
    }).join('\n\n');

    const systemPrompt = `Você é um assistente especializado em resumir conversas de atendimento ao cliente.
Gere um resumo objetivo e profissional da conversa abaixo.

O resumo deve incluir:
1. Assunto principal da conversa
2. Principais pontos discutidos
3. Decisões tomadas ou acordos feitos
4. Status atual ou pendências
5. Próximos passos (se aplicável)

Mantenha o resumo conciso mas completo, com no máximo 300 palavras.
Use bullet points para organizar as informações.`;

    const userPrompt = `Ticket: ${ticket.subject}
Tipo: ${ticket.ticket_type}
Proprietário: ${(ticket as any).profiles?.name || 'N/A'}
Imóvel: ${(ticket as any).properties?.name || 'N/A'}
Status: ${ticket.status}

CONVERSA:
${conversationText}`;

    // Call Lovable AI Gateway
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
        max_tokens: 1000,
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      throw new Error('Erro ao gerar resumo com IA');
    }

    const aiData = await aiResponse.json();
    const summary = aiData.choices?.[0]?.message?.content;

    if (!summary) {
      throw new Error('Resumo não gerado');
    }

    console.log(`Summary generated for ticket ${ticketId}, ${messages.length} messages`);

    return new Response(
      JSON.stringify({ summary }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in summarize-conversation:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
