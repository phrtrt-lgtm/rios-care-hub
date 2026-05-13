import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Recebe:
 *  - mode: "from_spreadsheet" | "refine"
 *  - spreadsheet_text?: string  (planilha colada como texto/CSV/JSON-livre)
 *  - current?: { categories, observations }
 *  - instruction?: string  (comando de refinamento do admin)
 *  - history?: [{role, content}]
 *
 * Retorna { categories, observations, ai_message }
 */

const SYSTEM_PROMPT = `Você é a curadora de design da RIOS Hospedagens.
Recebe planilhas/listas brutas de produtos e devolve uma curadoria pronta para o proprietário ver no portal.

IMPORTANTÍSSIMO sobre o tom:
- A RIOS faz TUDO pelo proprietário: compra, recebe, instala, posiciona, organiza e fotografa.
- O proprietário NÃO executa nada. NUNCA escreva no imperativo dirigido a ele ("posicione", "instale", "monte", "coloque", "fixe", "compre", "providencie").
- Fale sempre como nós ("vamos instalar", "iremos posicionar", "nossa equipe organiza") OU como impacto/benefício para o hóspede ("traz aconchego", "eleva a percepção de valor", "garante praticidade no check-in").
- Foco do "why" é justificar por que aquele item entra na curadoria — nunca instruir uma ação.

Regras de saída:
- Use a ferramenta "set_curation" para retornar a estrutura.
- Sempre em PT-BR, tom editorial RIOS (sofisticado, direto, vendedor).
- Categorize itens em: Sala & ambientes sociais, Decoração & alma do espaço, Quarto & rouparia, Cozinha equipada, Eletrônicos & eletrodomésticos. Pode criar outras se a planilha pedir.
- Cada item: name (curto), why (1 frase de IMPACTO p/ o hóspede ou de papel na ambientação — sem instruções ao proprietário), price (formato "R$ X.XXX"), img (use url da planilha se houver, senão "" — frontend usa placeholder), priority ("essencial" | "recomendado" | null), link (url do produto se houver), quantity (número inteiro — quantas unidades, ex: 2, 4, 6), unit (unidade do quantity, ex: "un", "par", "kit", "jogo", "m²"), dimensions (especificação COMPLETA do sub-item da planilha — cor + material/acabamento + medidas + qualquer detalhe técnico, ex: "nogueira 60x40 s/vidro", "caramelo 80x50", "King 193x203 400 fios", "off-white tripé chão", "terracota/bege/verde").

REGRA CRÍTICA DE FIDELIDADE AOS DADOS:
- NUNCA invente, troque, embaralhe ou reordene preços, links, quantidades ou tamanhos. Cada linha da planilha tem um conjunto (preço, link, quantidade, tamanho) que pertence APENAS àquele item — preserve EXATAMENTE como está.
- SEMPRE extraia quantity, unit e dimensions quando aparecerem na planilha. O campo "dimensions" DEVE conter o sub-item COMPLETO da planilha (cor, material, medidas, acabamento — tudo junto). Ex: se a planilha diz "nogueira 60x40 s/vidro", dimensions = "nogueira 60x40 s/vidro" (NÃO apenas "60x40"). Se diz "caramelo", dimensions = "caramelo". Se diz "pintado 2 unidades", dimensions = "pintado" e quantity = 2. NUNCA resuma ou omita partes do sub-item — o proprietário precisa comprar EXATAMENTE como descrito.
- Se não houver sub-item na planilha, deixe dimensions vazio — não invente.
- NÃO crie alternativas/opções nem itens opcionais. Cada linha da planilha vira UM item fixo na curadoria. Não use os campos "optional" nem "alternativeGroup" — sempre omita-os.
- Observações: 2-4 notas editoriais sobre o que NÓS faremos no imóvel (reposicionamento de mobília, ajustes de iluminação, aproveitamento do que já existe, cuidados de manutenção que cuidaremos). Cada uma: tag, title, body, icon ("Wand2"|"Lightbulb"|"AlertTriangle"|"Sparkles"). Mesma regra de tom: nada de imperativo ao proprietário.
- Se o admin pedir refinamento (modo refine), aplique o comando preservando o resto.`;

const TOOL = {
  type: "function",
  function: {
    name: "set_curation",
    description: "Devolve a curadoria estruturada.",
    parameters: {
      type: "object",
      properties: {
        ai_message: { type: "string", description: "Resposta curta ao admin (1-2 frases)" },
        categories: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: { type: "string" },
              title: { type: "string" },
              emoji: { type: "string" },
              desc: { type: "string" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    why: { type: "string" },
                    price: { type: "string" },
                    img: { type: "string" },
                    link: { type: "string" },
                    priority: { type: "string", enum: ["essencial", "recomendado", ""] },
                    quantity: { type: "number", description: "Quantidade de unidades (extraído da planilha — ex: 2, 4, 6). Não inventar." },
                    unit: { type: "string", description: "Unidade do quantity (ex: 'un', 'par', 'kit', 'jogo', 'm²')." },
                    dimensions: { type: "string", description: "Especificação COMPLETA do sub-item da planilha — cor, material, medidas, acabamento, tudo junto. Ex: 'nogueira 60x40 s/vidro', 'caramelo 80x50', 'King 193x203 400 fios'. NUNCA resumir nem omitir partes." },
                  },
                  required: ["name", "why", "price"],
                },
              },
            },
            required: ["key", "title", "emoji", "desc", "items"],
          },
        },
        observations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              icon: { type: "string", enum: ["Wand2", "Lightbulb", "AlertTriangle", "Sparkles"] },
              tag: { type: "string" },
              title: { type: "string" },
              body: { type: "string" },
            },
            required: ["icon", "tag", "title", "body"],
          },
        },
      },
      required: ["ai_message", "categories", "observations"],
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { mode, spreadsheet_text, current, instruction, history } = await req.json();

    const messages: any[] = [{ role: "system", content: SYSTEM_PROMPT }];

    if (mode === "from_spreadsheet") {
      messages.push({
        role: "user",
        content: `Planilha bruta (qualquer formato — extraia o que conseguir):\n\n${spreadsheet_text}\n\nGere a curadoria completa.`,
      });
    } else {
      messages.push({
        role: "user",
        content: `Curadoria atual (JSON):\n${JSON.stringify(current)}\n\nHistórico:\n${(history || []).map((m: any) => `${m.role}: ${m.content}`).join("\n")}\n\nNovo comando do admin: ${instruction}\n\nDevolva a curadoria atualizada.`,
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not set");

    async function callModel(model: string) {
      return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          tools: [TOOL],
          tool_choice: { type: "function", function: { name: "set_curation" } },
        }),
      });
    }

    function extractArgs(data: any): any | null {
      const msg = data?.choices?.[0]?.message;
      const tc = msg?.tool_calls?.[0];
      if (tc?.function?.arguments) {
        try { return JSON.parse(tc.function.arguments); } catch { /* fallthrough */ }
      }
      // Fallback: parse JSON from content (model returned text instead of tool call)
      const content = typeof msg?.content === "string" ? msg.content : "";
      if (content) {
        const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        const raw = fenced ? fenced[1] : content;
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        if (start >= 0 && end > start) {
          try { return JSON.parse(raw.slice(start, end + 1)); } catch { /* ignore */ }
        }
      }
      return null;
    }

    let resp = await callModel("google/gemini-2.5-pro");
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI gateway error", resp.status, t);
      if (resp.status === 429) return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: corsHeaders });
      if (resp.status === 402) return new Response(JSON.stringify({ error: "credits" }), { status: 402, headers: corsHeaders });
      return new Response(JSON.stringify({ error: "ai_error" }), { status: 500, headers: corsHeaders });
    }

    let data = await resp.json();
    let args = extractArgs(data);

    // Retry with stronger model if primary didn't return a usable tool call/JSON
    if (!args) {
      console.warn("gemini-2.5-pro returned no tool call, retrying with gpt-5");
      resp = await callModel("openai/gpt-5");
      if (resp.ok) {
        data = await resp.json();
        args = extractArgs(data);
      } else {
        console.error("fallback model error", resp.status, await resp.text());
      }
    }

    if (!args) throw new Error("no tool call");

    return new Response(JSON.stringify(args), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
