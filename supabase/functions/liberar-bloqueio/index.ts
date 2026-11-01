// liberar-bloqueio — o proprietário (ou a equipe) libera um bloqueio de datas
// que ele mesmo pediu, ou retira um pedido que ainda não foi processado.
// Pedido do gestor em 2026-10-31 (CLAUDE.md §3.21).
//
// Corpo: { id } (id do pedido em date_block_requests)
//   - status `processed` (bloqueio feito na Hostex, pago ou pela equipe):
//     reabre as noites que ainda não passaram no calendário mestre da Hostex
//     (POST /availabilities, available = true) e marca `liberado`.
//   - status `pending` ou `aguardando_pagamento`: só marca `cancelado`
//     (nada foi bloqueado ainda) e limpa o QR.
// A taxa de limpeza paga não é devolvida automaticamente: a equipe vê o
// pedido como "Liberado" em /admin/bloqueios-datas e decide.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { exigirPapel } from "../_shared/auth-guard.ts";
import { hostexPost } from "../_shared/hostexReserva.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const diaNum = (d: string) => {
  const [a, m, dd] = d.slice(0, 10).split("-").map(Number);
  return Date.UTC(a, m - 1, dd) / 86400000;
};
const dataDe = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);
const hojeBrasilia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

type Linha = Record<string, any>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const { autor, resposta } = await exigirPapel(req, ["owner", "admin", "agent", "maintenance"], corsHeaders);
  if (resposta) return resposta;
  if (!autor) return json({ error: "Não autenticado." }, 401);
  const equipe = autor.role !== "owner";

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const corpo = (await req.json().catch(() => ({}))) as Linha;
  const id = String(corpo.id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Pedido inválido." }, 400);

  const { data: pedido } = await supabase
    .from("date_block_requests")
    .select("id, property_id, owner_id, start_date, end_date, status, reason, valor_cents, pago_em, property:properties(name)")
    .eq("id", id)
    .maybeSingle();
  if (!pedido) return json({ error: "Pedido não encontrado." }, 404);

  // 1. acesso: dono ou membro do imóvel; equipe passa.
  if (!equipe) {
    const { data: ok } = await supabase.rpc("has_property_access", { _user_id: autor.id, _property_id: pedido.property_id });
    if (ok !== true && pedido.owner_id !== autor.id) return json({ error: "Você não tem acesso a esse pedido." }, 403);
  }
  const nomeImovel = (Array.isArray(pedido.property) ? pedido.property[0] : pedido.property)?.name ?? "imóvel";
  const hoje = hojeBrasilia();
  const agora = new Date().toISOString();

  // 2. pedido ainda não processado: só retira.
  if (pedido.status === "pending" || pedido.status === "aguardando_pagamento") {
    const { error } = await supabase
      .from("date_block_requests")
      .update({ status: "cancelado", liberado_em: agora, liberado_por: autor.id, pix_qr_code: null, pix_qr_code_base64: null })
      .eq("id", id)
      .eq("status", pedido.status);
    if (error) return json({ error: "Não consegui cancelar o pedido." }, 500);
    return json({ id, imovel: nomeImovel, status: "cancelado", resultado: "Pedido retirado antes de ser processado; nada foi bloqueado." });
  }

  if (pedido.status !== "processed") {
    const motivo: Record<string, string> = {
      liberado: "Esse bloqueio já foi liberado.",
      cancelado: "Esse pedido já foi cancelado.",
      rejected: "Esse pedido foi recusado pela equipe; não há bloqueio para liberar.",
      expirado: "O PIX desse pedido expirou; não há bloqueio para liberar.",
      pago_pendente_hostex: "Esse bloqueio está pago e a equipe ainda vai concluir na Hostex. Fale com a equipe para cancelar.",
    };
    return json({ error: motivo[pedido.status] ?? `Pedido em status ${pedido.status}; nada a liberar.`, codigo: "status" }, 409);
  }

  // 3. bloqueio feito: libera as noites que ainda não passaram.
  const ultimaNoite = dataDe(diaNum(String(pedido.end_date)) - 1);
  if (ultimaNoite < hoje) return json({ error: "Esse bloqueio já passou; não há noites para liberar." , codigo: "passado" }, 409);
  const de = String(pedido.start_date) > hoje ? String(pedido.start_date) : hoje;
  const noites = diaNum(ultimaNoite) - diaNum(de) + 1;

  const hostexKey = Deno.env.get("HOSTEX_API_KEY");
  if (!hostexKey) return json({ error: "A Hostex não está configurada. Avise a equipe." }, 503);
  const { data: hx } = await supabase
    .from("hostex_properties")
    .select("id_hostex")
    .eq("property_id", pedido.property_id)
    .limit(1)
    .maybeSingle();
  const idHostex = Number(hx?.id_hostex);
  if (!Number.isInteger(idHostex)) {
    return json({ error: "Este imóvel não tem propriedade vinculada na Hostex. Avise a equipe para liberar as datas." }, 422);
  }

  let requestId: string | null = null;
  try {
    const resp = await hostexPost(
      "/availabilities",
      { property_ids: [idHostex], start_date: de, end_date: ultimaNoite, available: true },
      hostexKey,
    );
    requestId = resp?.request_id ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[liberar-bloqueio] hostex:", msg);
    await supabase.from("date_block_requests").update({ erro_hostex: `Liberação falhou: ${msg}`.slice(0, 500) }).eq("id", id);
    return json({ error: "A Hostex não aceitou a liberação agora. Tente de novo em instantes ou avise a equipe." }, 502);
  }

  const { error } = await supabase
    .from("date_block_requests")
    .update({
      status: "liberado",
      liberado_em: agora,
      liberado_por: autor.id,
      hostex_liberado_em: agora,
      hostex_liberacao_request_id: requestId,
      erro_hostex: null,
    })
    .eq("id", id)
    .eq("status", "processed");
  if (error) {
    console.error("[liberar-bloqueio] update:", error.message);
    return json({ error: "As datas foram liberadas na Hostex, mas não consegui gravar. Avise a equipe." }, 500);
  }

  return json({
    id,
    imovel: nomeImovel,
    status: "liberado",
    de,
    ate: ultimaNoite,
    saida: String(pedido.end_date),
    noites_liberadas: noites,
    taxa_paga_cents: pedido.pago_em ? pedido.valor_cents ?? null : null,
    resultado: `Noites de ${de} a ${ultimaNoite} liberadas na Hostex; voltam a ficar à venda no Airbnb e no Booking em alguns minutos.`,
    aviso: pedido.pago_em ? "A taxa de limpeza paga não é devolvida automaticamente; fale com a equipe se precisar." : null,
  });
});
