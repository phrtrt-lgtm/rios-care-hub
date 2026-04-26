// Edge function: usa IA para extrair dados estruturados de uma ficha .md
// e devolver no formato esperado pelo formulário "Atualização de Anúncio".

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BED_TYPES = [
  "casal_queen",
  "casal_king",
  "casal_padrao",
  "solteiro",
  "solteiro_king",
  "beliche",
  "bicama",
  "sofa_cama",
  "sofa_retratil",
  "colchao_chao",
  "berco",
] as const;

const SCHEMA = {
  name: "extract_ficha",
  description:
    "Extrai dados estruturados de uma ficha técnica de imóvel em Markdown para pré-preencher um formulário de atualização de anúncio.",
  parameters: {
    type: "object",
    properties: {
      checkIn: {
        type: "string",
        description: "Horário de check-in em formato HH:MM (24h). Vazio se não informado.",
      },
      checkOut: {
        type: "string",
        description: "Horário de check-out em formato HH:MM (24h). Vazio se não informado.",
      },
      maxCapacity: {
        type: "number",
        description: "Capacidade máxima de hóspedes. 0 se não informado.",
      },
      petsAllowed: {
        type: "boolean",
        description: "true se aceita pets, false se não aceita.",
      },
      petsMax: {
        type: "number",
        description: "Quantidade máxima de pets. 0 se não informado ou não aceita.",
      },
      petsSize: {
        type: "string",
        enum: ["pequeno", "medio", "grande", "qualquer"],
        description: "Porte máximo permitido para pets.",
      },
      petFeePerStay: {
        type: "string",
        description:
          "Taxa por estadia por pet (apenas o número, ex: '50' ou '50.00'). Vazio se não informado.",
      },
      extraGuestFee: {
        type: "string",
        description:
          "Taxa por hóspede extra por diária (apenas o número). Vazio se não informado.",
      },
      cleaningFee: {
        type: "string",
        description:
          "Valor da taxa de limpeza/faxina (apenas o número, ignore durações como '4h'). Vazio se não informado.",
      },
      rooms: {
        type: "array",
        description:
          "Lista de quartos/suítes do imóvel. NÃO inclua 'colchões extras' aqui — eles vão em extraMattresses.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Nome do quarto, ex: 'Quarto 1', 'Suíte master'." },
            beds: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: [...BED_TYPES],
                    description: "Tipo da cama. Mapeie descrições livres ao enum.",
                  },
                  count: { type: "number", description: "Quantidade dessa cama." },
                },
                required: ["type", "count"],
                additionalProperties: false,
              },
            },
            amenities: {
              type: "array",
              description:
                "Comodidades extras do quarto (ex: 'Ar-condicionado', 'TV', 'Varanda').",
              items: { type: "string" },
            },
          },
          required: ["name", "beds", "amenities"],
          additionalProperties: false,
        },
      },
      extraMattresses: {
        type: "array",
        description:
          "Colchões/camas extras avulsos (não associados a um quarto fixo). Ex: 'Colchão queen inflável'.",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            count: { type: "number" },
          },
          required: ["description", "count"],
          additionalProperties: false,
        },
      },
    },
    required: [
      "checkIn",
      "checkOut",
      "maxCapacity",
      "petsAllowed",
      "petsMax",
      "petsSize",
      "petFeePerStay",
      "extraGuestFee",
      "cleaningFee",
      "rooms",
      "extraMattresses",
    ],
    additionalProperties: false,
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { markdown } = await req.json();
    if (typeof markdown !== "string" || !markdown.trim()) {
      return new Response(
        JSON.stringify({ error: "markdown vazio" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const systemPrompt = `Você é um assistente que extrai dados estruturados de fichas técnicas de imóveis em Markdown.

Regras importantes:
- Sempre devolva via tool call (extract_ficha). Nunca em texto livre.
- Horários: converta "15h", "às 15h", "a partir de 15h" → "15:00".
- Camas: mapeie descrições para o enum. Exemplos:
  - "Cama de casal Queen" → casal_queen
  - "Cama King" → casal_king
  - "Solteiro King" / "Super solteiro" → solteiro_king
  - "Beliche" → beliche
  - "Bicama" → bicama
  - "Sofá-cama" / "Sofá cama" → sofa_cama
  - "Sofá retrátil" → sofa_retratil
  - "Colchão no chão" / "colchão extra" / "inflável" → colchao_chao (ou vai pra extraMattresses)
  - "Berço" → berco
- Tabelas transpostas: se uma tabela tem cabeçalho como "| Quarto 1 | Quarto 2 | Extra |", trate cada COLUNA como um quarto.
- A coluna "Extra" deve virar extraMattresses, não rooms.
- Pets: se diz "Apenas pequeno porte, 2", então petsAllowed=true, petsMax=2, petsSize=pequeno.
- Taxas: extraia apenas o número (sem R$, sem "por dia", etc). Se diz "4h" para faxina, isso é DURAÇÃO, não valor — ignore.
- Comodidades do quarto: extraia coisas como AC, TV, varanda, área externa.
- Se um campo não aparece, devolva string vazia, 0, false ou array vazio conforme o schema.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Ficha técnica:\n\n${markdown}` },
        ],
        tools: [{ type: "function", function: SCHEMA }],
        tool_choice: { type: "function", function: { name: "extract_ficha" } },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway erro:", aiResp.status, errText);
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos em Settings > Workspace > Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw new Error(`AI gateway: ${aiResp.status}`);
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error("IA não devolveu tool call");
    }

    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ data: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("parse-ficha-anuncio error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
