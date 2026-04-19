import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PreviewRequest {
  mode: "preview";
  instruction: string;
  property_ids: string[];
}

interface ApplyRequest {
  mode: "apply";
  changes: Array<{
    property_id: string;
    file_id: string;
    new_content: string;
  }>;
  change_reason: string;
}

const SYSTEM_PROMPT = `Você é um assistente que edita fichas técnicas de imóveis em formato Markdown.

REGRAS:
- Receba a ficha atual do imóvel + uma instrução do administrador.
- Aplique APENAS o que a instrução pede. Preserve TODO o resto do conteúdo, formatação, estrutura de seções e ordem.
- Se a instrução pede para adicionar uma seção que já existe (ex: "Check-out"), ATUALIZE essa seção em vez de duplicar.
- Se a seção não existe, crie-a em uma posição lógica (ex: instruções de check-out perto de check-in).
- Mantenha o estilo de Markdown da ficha original (níveis de heading, listas, negritos).
- NÃO invente informações específicas do imóvel. Use exatamente o que vier na instrução.
- Se a instrução for genérica (ex: "adicionar método de check-out") e não trouxer o conteúdo específico, use um placeholder claro como "[A definir pelo administrador]".

RETORNE APENAS o Markdown completo final da ficha. Sem comentários, sem code fences, sem explicações.`;

async function callAI(currentMd: string, instruction: string, propertyName: string) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");

  const userPrompt = `IMÓVEL: ${propertyName}\n\n=== FICHA ATUAL ===\n${currentMd}\n\n=== INSTRUÇÃO ===\n${instruction}\n\nRetorne a ficha completa atualizada em Markdown.`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!resp.ok) {
    if (resp.status === 429) throw new Error("Limite de requisições atingido. Aguarde e tente novamente.");
    if (resp.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
    const t = await resp.text();
    throw new Error(`AI gateway error ${resp.status}: ${t}`);
  }

  const data = await resp.json();
  let text: string = data.choices?.[0]?.message?.content || "";
  // Strip code fences if model wrapped them
  text = text.replace(/^```(?:markdown|md)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  return text;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (!profile || !["admin", "agent", "maintenance"].includes(profile.role)) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    if (body.mode === "preview") {
      const { instruction, property_ids } = body as PreviewRequest;
      if (!instruction?.trim() || !Array.isArray(property_ids) || property_ids.length === 0) {
        return new Response(JSON.stringify({ error: "instruction e property_ids são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: files } = await supabase
        .from("property_files")
        .select("id, property_id, content_md, version, properties:property_id(name)")
        .in("property_id", property_ids);

      const filesArr = files || [];

      // Process in parallel with concurrency limit
      const results: any[] = [];
      const concurrency = 4;
      for (let i = 0; i < filesArr.length; i += concurrency) {
        const batch = filesArr.slice(i, i + concurrency);
        const settled = await Promise.all(
          batch.map(async (f: any) => {
            const propName = f.properties?.name || "Imóvel";
            try {
              const newContent = await callAI(f.content_md || "", instruction, propName);
              const changed = newContent.trim() !== (f.content_md || "").trim();
              return {
                property_id: f.property_id,
                property_name: propName,
                file_id: f.id,
                version: f.version,
                old_content: f.content_md || "",
                new_content: newContent,
                changed,
                error: null as string | null,
              };
            } catch (e: any) {
              return {
                property_id: f.property_id,
                property_name: propName,
                file_id: f.id,
                version: f.version,
                old_content: f.content_md || "",
                new_content: f.content_md || "",
                changed: false,
                error: e?.message || "Erro desconhecido",
              };
            }
          })
        );
        results.push(...settled);
      }

      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.mode === "apply") {
      const { changes, change_reason } = body as ApplyRequest;
      if (!Array.isArray(changes) || changes.length === 0) {
        return new Response(JSON.stringify({ error: "changes obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let updated = 0;
      const errors: any[] = [];
      for (const c of changes) {
        const { error } = await supabase
          .from("property_files")
          .update({
            content_md: c.new_content,
            updated_by: userId,
          })
          .eq("id", c.file_id);
        if (error) {
          errors.push({ property_id: c.property_id, error: error.message });
        } else {
          updated++;
          // Tag the latest version row with the change reason
          await supabase
            .from("property_file_versions")
            .update({ change_reason })
            .eq("property_file_id", c.file_id)
            .order("version", { ascending: false })
            .limit(1);
        }
      }

      return new Response(JSON.stringify({ updated, errors }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "mode inválido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("bulk-edit-fichas error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
