// ai-generate-response — sugestões de texto para a equipe (resposta em
// chamado e cobrança, descrição de proposta/alerta/chamado/manutenção,
// título curto) e o "Testar prompt" de /configuracao-ia.
//
// Desde 2026-10-30 roda no Claude pelo módulo comum (_shared/ia/claude.ts):
// modelo e effort vêm de ai_settings (padrão claude-sonnet-5-5 / medium).
// `ai_settings` e `ai_templates` são lidos com a service role depois de
// conferir o papel: antes eram lidos com o JWT do usuário e a RLS (só admin)
// fazia agent/maintenance receberem "AI settings not configured".
// O contexto do chamado/cobrança continua lido com o JWT do usuário (RLS).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { exigirPapel } from "../_shared/auth-guard.ts";
import { ErroIA, gerarTexto, normalizarEffort, normalizarModelo } from "../_shared/ia/claude.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface Pedido {
  templateKey?: string;
  action?: string;
  // deno-lint-ignore no-explicit-any
  context?: any;
  ticketId?: string;
  chargeId?: string;
  customInstructions?: string;
}

const CONTEXTO_RIOS = `A RIOS é uma empresa de Operação e Gestão de Hospedagens que administra imóveis de aluguel por temporada. Oferecemos gestão completa de propriedades, incluindo:
- Gestão de reservas e check-in/check-out
- Manutenção e limpeza profissional
- Suporte aos proprietários
- Gestão financeira e repasses
- Marketing e divulgação dos imóveis`;

const dataBR = (iso: string) => new Intl.DateTimeFormat("pt-BR").format(new Date(iso));

function promptsDaAcao(action: string, context: Record<string, unknown> = {}): { system: string; pedido: string; effort?: "low" | "medium" } {
  const prompt = String(context.prompt ?? "");
  switch (action) {
    case "generate_proposal":
      return {
        system: `Você escreve descrições profissionais e claras para votações e propostas de melhoria em imóveis de hospedagem.

Contexto do projeto: ${context.projectContext ?? ""}

Diretrizes: português do Brasil; claro, objetivo e profissional; foque nos benefícios e nas justificativas; 2 a 4 parágrafos; sem jargão técnico desnecessário. Devolva só o texto.`,
        pedido: prompt,
      };
    case "generate_alert":
      return {
        system: `Você escreve mensagens profissionais e claras para avisos e comunicações da RIOS com proprietários de imóveis de hospedagem.

Diretrizes: português do Brasil; claro, objetivo e profissional; tom adequado ao tipo de aviso; 2 a 4 parágrafos; direto, sem prolixidade; termine com a orientação prática quando houver. Devolva só o texto.`,
        pedido: prompt,
      };
    case "generate_ticket":
      return {
        system: `Você escreve descrições profissionais e claras para chamados (tickets) da RIOS a proprietários sobre manutenção, dúvidas, informações e outros assuntos.

Diretrizes: português do Brasil; claro, objetivo e profissional; foque no assunto e na ação esperada; 2 a 4 parágrafos; sem jargão técnico desnecessário; seja específico sobre o que está sendo comunicado. Devolva só o texto.`,
        pedido: prompt,
      };
    case "generate_maintenance":
      return {
        system: `Você escreve descrições técnicas e detalhadas para chamados de manutenção em imóveis de hospedagem.

${context.propertyContext ? `${context.propertyContext}\n` : ""}${
          context.projectContext ??
            "Sistema de gestão de hospedagens RIOS - registro de manutenção preventiva ou corretiva em unidades de aluguel por temporada."
        }

Diretrizes: português do Brasil; técnico mas acessível; descreva o problema de forma clara; inclua a localização exata quando possível; mencione os sintomas observados; indique urgência se houver; 2 a 3 parágrafos; foque no que precisa ser resolvido. Devolva só o texto.`,
        pedido: prompt,
      };
    case "generate_title": {
      const descricao = String(context.description ?? "");
      const problemas = descricao.split("\n").filter((l) => l.trim()).length;
      return {
        effort: "low",
        system: `Você cria títulos CURTOS para chamados de manutenção.

Regras obrigatórias:
1. Máximo de 40 caracteres.
2. ${
          problemas > 1
            ? `A descrição tem ${problemas} problemas diferentes: use um título genérico como "Múltiplos reparos", "Diversos ajustes" ou "Reparos gerais".`
            : "Resuma o problema principal."
        }
3. Nunca concatene nem liste vários problemas.
4. Não comece com "Manutenção", "Reparo" ou "Conserto".
5. Sem aspas e sem pontuação final.
6. Responda apenas o título, nada mais.

Exemplos para um problema: "Torneira vazando no banheiro", "Ar-condicionado não funciona".
Exemplos para vários: "Múltiplos reparos necessários", "Diversos ajustes na unidade".`,
        pedido: `${problemas > 1 ? `Atenção: são ${problemas} problemas diferentes. Gere um título genérico.` : "Gere um título curto."}\n\n${descricao}`,
      };
    }
    default:
      throw new ErroIA(400, "Ação inválida.");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const inicio = Date.now();
  const { autor, resposta } = await exigirPapel(req, ["admin", "agent", "maintenance"], corsHeaders);
  if (resposta) return resposta;
  if (!autor) return json({ error: "Não autenticado." }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("authorization")! } },
  });

  let templateKey: string | undefined;
  try {
    const pedido = (await req.json().catch(() => ({}))) as Pedido;
    templateKey = pedido.templateKey;

    const { data: aiSettings } = await admin.from("ai_settings").select("*").limit(1).maybeSingle();
    const modelo = normalizarModelo(aiSettings?.model);
    const effortPadrao = normalizarEffort(aiSettings?.effort);
    const maxTokens = Math.max(Number(aiSettings?.max_tokens ?? 800), 1500);

    // "Testar prompt" da tela de configuração: só admin, não grava nada.
    if (pedido.action === "test_prompt") {
      if (autor.role !== "admin") return json({ error: "Só admin testa o prompt." }, 403);
      const c = pedido.context ?? {};
      const system = `${c.systemPrompt ?? ""}

${c.styleGuide ? `GUIA DE ESTILO:\n${c.styleGuide}\n` : ""}
${c.guardrails ? `REGRAS DE SEGURANÇA:\n${c.guardrails}\n` : ""}`;
      const { texto } = await gerarTexto({
        system,
        pedido: String(c.userPrompt ?? "Olá"),
        modelo: normalizarModelo(c.model),
        effort: normalizarEffort(c.effort ?? effortPadrao),
        maxTokens: Math.max(Number(c.maxTokens ?? maxTokens), 1500),
      });
      return json({ text: texto });
    }

    if (pedido.action) {
      const p = promptsDaAcao(pedido.action, pedido.context ?? {});
      const { texto } = await gerarTexto({
        system: p.system,
        pedido: p.pedido,
        modelo,
        effort: p.effort ?? effortPadrao,
        maxTokens,
      });
      return json({ generatedText: texto });
    }

    if (!templateKey) return json({ error: "templateKey ou action é obrigatório." }, 400);
    if (!aiSettings) return json({ error: "Configuração da IA não encontrada (ai_settings)." }, 400);

    const { data: template } = await admin
      .from("ai_templates")
      .select("*")
      .eq("key", templateKey)
      .eq("enabled", true)
      .maybeSingle();
    if (!template) return json({ error: "Modelo de resposta não encontrado ou desligado.", templateKey }, 404);

    let contexto = "";

    if (pedido.ticketId) {
      const { data: ticket } = await userClient
        .from("tickets")
        .select(`*, owner:profiles!tickets_owner_id_fkey(name, email, phone), property:properties(name, address)`)
        .eq("id", pedido.ticketId)
        .maybeSingle();
      const { data: mensagens } = await userClient
        .from("ticket_messages")
        .select("body, created_at, profiles(name, role)")
        .eq("ticket_id", pedido.ticketId)
        .order("created_at", { ascending: true })
        .limit(60);
      // deno-lint-ignore no-explicit-any
      const historico = (mensagens ?? []).map((m: any) =>
        `${m.profiles?.name ?? "?"} (${m.profiles?.role === "owner" ? "Proprietário" : "Equipe"}): ${m.body}`
      ).join("\n");
      if (ticket) {
        contexto = `
CONTEXTO DA EMPRESA:
${CONTEXTO_RIOS}

CONTEXTO DO CHAMADO:
- Assunto: ${ticket.subject}
- Descrição: ${ticket.description}
- Status: ${ticket.status}
- Prioridade: ${ticket.priority}
- Tipo: ${ticket.ticket_type}
- Criado em: ${dataBR(ticket.created_at)}
- Proprietário: ${ticket.owner?.name} (${ticket.owner?.email})${ticket.owner?.phone ? ` - Tel: ${ticket.owner.phone}` : ""}
- Imóvel: ${ticket.property?.name ?? "—"}${ticket.property?.address ? ` - ${ticket.property.address}` : ""}
${ticket.blocked_dates_start ? `- Período de bloqueio pedido: ${dataBR(ticket.blocked_dates_start)} a ${dataBR(ticket.blocked_dates_end)}` : ""}

HISTÓRICO DA CONVERSA:
${historico}
`;
      }
    }

    if (pedido.chargeId) {
      const { data: charge } = await userClient
        .from("charges")
        .select(`*, owner:profiles!charges_owner_id_fkey(name, email), ticket:tickets(subject, property:properties(name))`)
        .eq("id", pedido.chargeId)
        .maybeSingle();
      const { data: mensagens } = await userClient
        .from("charge_messages")
        .select("body, created_at, profiles(name, role)")
        .eq("charge_id", pedido.chargeId)
        .order("created_at", { ascending: true })
        .limit(60);
      // deno-lint-ignore no-explicit-any
      const historico = (mensagens ?? []).map((m: any) =>
        `${m.profiles?.name ?? "?"} (${m.profiles?.role === "owner" ? "Proprietário" : "Equipe"}): ${m.body}`
      ).join("\n");
      if (charge) {
        const valor = new Intl.NumberFormat("pt-BR", { style: "currency", currency: charge.currency || "BRL" })
          .format(charge.amount_cents / 100);
        contexto = `
CONTEXTO DA EMPRESA:
${CONTEXTO_RIOS}

IMPORTANTE SOBRE COBRANÇAS:
- Toda cobrança é criada pela equipe RIOS, nunca pelo proprietário.
- O proprietário está recebendo esta cobrança da RIOS por serviços, manutenções ou despesas do imóvel dele.
- A RIOS cobra o proprietário, não o contrário.

CONTEXTO DA COBRANÇA:
- Título: ${charge.title}
- Descrição: ${charge.description || "—"}
- Valor: ${valor}
- Vencimento: ${charge.due_date ? dataBR(charge.due_date) : "—"}
- Status: ${charge.status}
- Proprietário: ${charge.owner?.name} (${charge.owner?.email})
${charge.ticket ? `- Chamado relacionado: ${charge.ticket.subject}` : ""}
${charge.ticket?.property ? `- Imóvel: ${charge.ticket.property.name}` : ""}
${charge.payment_link_url ? `- Link de pagamento: ${charge.payment_link_url}` : ""}

HISTÓRICO DA CONVERSA:
${historico}

ORIENTAÇÕES PARA RESPOSTA:
- Você responde em nome da RIOS para o proprietário.
- Seja claro sobre o motivo da cobrança; se houver dúvida, explique.
- Mencione o prazo de contestação quando fizer sentido (7 dias corridos após o recebimento).
- Cordial e profissional.
`;
      }
    }

    const system = `${aiSettings.system_prompt}

${aiSettings.style_guide ? `GUIA DE ESTILO:\n${aiSettings.style_guide}\n` : ""}
${aiSettings.guardrails ? `REGRAS DE SEGURANÇA:\n${aiSettings.guardrails}\n` : ""}
${
      pedido.chargeId
        ? `
CONTEXTO CRÍTICO SOBRE COBRANÇAS:
Você responde em nome da RIOS, que está cobrando o proprietário. Você já sabe o motivo da cobrança: nunca pergunte "qual o motivo da sua cobrança".`
        : ""
    }`;

    const pedidoTexto = `${contexto}

${pedido.customInstructions ? `INSTRUÇÕES DO ATENDENTE:\n${pedido.customInstructions}\n\n` : ""}${template.template_prompt}

IMPORTANTE:
- Responda sempre em português do Brasil, de forma direta e profissional.
- Use o contexto da RIOS e o histórico da conversa.
- Mantenha 2 a 4 parágrafos no máximo.
- Não invente informações que não estão no contexto.
- Assine como "— Equipe RIOS".
- Devolva só o texto da resposta.`;

    const { texto, uso, resposta: r } = await gerarTexto({ system, pedido: pedidoTexto, modelo, effort: effortPadrao, maxTokens });

    await admin.from("ai_usage_logs").insert({
      ticket_id: pedido.ticketId || null,
      charge_id: pedido.chargeId || null,
      template_key: templateKey,
      request_tokens: uso.tokens_entrada + uso.tokens_cache_lidos + uso.tokens_cache_gravados,
      response_tokens: uso.tokens_saida,
      model: r.model,
      latency_ms: Date.now() - inicio,
      created_by: autor.id,
      success: true,
    });

    return json({ text: texto });
  } catch (e) {
    const status = e instanceof ErroIA ? e.status : 500;
    const mensagem = e instanceof ErroIA ? e.message : "Erro ao gerar o texto.";
    if (!(e instanceof ErroIA)) console.error("[ai-generate-response]", e);
    await admin.from("ai_usage_logs").insert({
      template_key: templateKey ?? null,
      created_by: autor.id,
      success: false,
      error: mensagem.slice(0, 500),
      model: "claude",
      latency_ms: Date.now() - inicio,
    }).then(({ error }: { error: { message: string } | null }) => {
      if (error) console.error("[ai-generate-response] log:", error.message);
    });
    return json({ error: mensagem }, status);
  }
});
