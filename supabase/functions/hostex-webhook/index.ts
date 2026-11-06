// hostex-webhook — recebe eventos da Hostex em tempo real.
// Autenticação: header Hostex-Webhook-Secret-Token == integration_secrets.hostex_webhook_secret
// (ou env HOSTEX_WEBHOOK_SECRET)
// (fail closed: sem secret ou diferente -> 401).
// reservation_created / reservation_updated: grava o payload bruto em
// hostex_webhook_events (event_id único = não processa duas vezes), busca a
// reserva completa na API e faz upsert em hostex_reservations como a sync.
// O trigger da tabela cuida do WhatsApp.
// Depois do cache, o mesmo evento passa pelo bloqueio de limpeza
// (_shared/limpeza): fecha a véspera do check-in e o dia do check-out dos
// imóveis do escopo, e reabre no cancelamento ou na troca de datas.
// Modo interno (header x-internal-token, token do Vault conferido por
// verificar_token_interno), usado pelo cron e pelo reprocesso manual:
//   { "limpeza": "pendencias" }                          verificações órfãs
//   { "limpeza": "reprocessar", "reservation_code": "…" } uma reserva
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { codigoDaReserva, extractList, hostexGet, linhaReserva } from "../_shared/hostexReserva.ts";
import { idImovel } from "../_shared/limpeza/calculo.ts";
import { processarEventoLimpeza, reprocessarReserva, verificarPendencias } from "../_shared/limpeza/fluxo.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function extrairCodigo(p: any): string {
  const cands = [
    p?.reservation_code, p?.data?.reservation_code, p?.reservation?.reservation_code,
    p?.data?.reservation?.reservation_code, p?.payload?.reservation_code, p?.code, p?.data?.code,
  ];
  for (const c of cands) if (c) return String(c);
  return "";
}

async function processar(supabase: any, eventRowId: string, payload: any) {
  try {
    const codigo = extrairCodigo(payload);
    if (!codigo) throw new Error("reservation_code não encontrado no payload");
    const apiKey = Deno.env.get("HOSTEX_API_KEY");
    if (!apiKey) throw new Error("HOSTEX_API_KEY não configurada");

    const resp = await hostexGet("/reservations", { reservation_code: codigo }, apiKey);
    const r = extractList(resp, "reservations").find((x: any) => codigoDaReserva(x) === codigo);
    if (!r) throw new Error(`reserva ${codigo} não retornada pela API`);

    const hxPid = String(r.property_id ?? r.listing_id ?? "");
    let propertyId: string | null = null;
    if (hxPid) {
      const { data } = await supabase.from("hostex_properties").select("property_id").eq("id_hostex", hxPid).maybeSingle();
      propertyId = data?.property_id ?? null;
    }
    const row = linhaReserva(r, () => propertyId);
    if (!row.check_in_date || !row.check_out_date) throw new Error("reserva sem datas");
    const { error } = await supabase.from("hostex_reservations").upsert(row, { onConflict: "reservation_code" });
    if (error) throw new Error(`upsert_failed: ${error.message}`);
    await supabase.from("hostex_webhook_events").update({ processed_at: new Date().toISOString(), error: null }).eq("id", eventRowId);
  } catch (e) {
    console.error("[hostex-webhook]", (e as Error).message);
    await supabase.from("hostex_webhook_events").update({ error: (e as Error).message }).eq("id", eventRowId);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: true });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Modo interno do bloqueio de limpeza: nunca passa pelo segredo da Hostex.
  const interno = req.headers.get("x-internal-token");
  if (interno) {
    const { data: valido, error: erroToken } = await supabase.rpc("verificar_token_interno", { p_token: interno });
    if (erroToken || valido !== true) return json({ error: "unauthorized" }, 401);
    let corpo: any = null;
    try { corpo = await req.json(); } catch { /* corpo vazio */ }
    let trabalho: Promise<unknown>;
    if (corpo?.limpeza === "pendencias") {
      trabalho = verificarPendencias(supabase).catch((e) => console.error("[hostex-webhook] limpeza pendencias", (e as Error).message));
    } else if (corpo?.limpeza === "reprocessar" && typeof corpo?.reservation_code === "string" && corpo.reservation_code.trim()) {
      trabalho = reprocessarReserva(supabase, corpo.reservation_code.trim(), idImovel(corpo.property_id));
    } else {
      return json({ error: "modo interno desconhecido" }, 400);
    }
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(trabalho); else await trabalho;
    return json({ ok: true, limpeza: corpo.limpeza });
  }

  const recebido = req.headers.get("hostex-webhook-secret-token") ?? "";
  const { data: sec } = await supabase.from("integration_secrets").select("value").eq("name", "hostex_webhook_secret").maybeSingle();
  const validos = [sec?.value, Deno.env.get("HOSTEX_WEBHOOK_SECRET")].filter((v): v is string => !!v);
  if (!recebido || validos.length === 0 || !validos.some((v) => iguais(recebido, v))) return json({ error: "unauthorized" }, 401);

  let payload: any = null;
  try { payload = await req.json(); } catch { return json({ ok: true, ignorado: "corpo inválido" }); }

  const evento = String(payload?.event ?? payload?.event_type ?? payload?.type ?? "");
  const eventId = String(payload?.event_id ?? payload?.id ?? crypto.randomUUID());

  const { data: ins, error } = await supabase
    .from("hostex_webhook_events")
    .insert({ event_id: eventId, event: evento, payload })
    .select("id").maybeSingle();
  if (error) {
    if (error.code === "23505") return json({ ok: true, duplicado: true });
    console.error("[hostex-webhook] log falhou", error.message);
    return json({ ok: true });
  }

  if (evento !== "reservation_created" && evento !== "reservation_updated") return json({ ok: true, ignorado: evento });

  // Cache primeiro, bloqueio de limpeza depois; nenhum dos dois lança, e a
  // falha de um não impede o outro.
  const tarefa = (async () => {
    await processar(supabase, ins!.id, payload);
    await processarEventoLimpeza(supabase, payload);
  })();
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(tarefa); else await tarefa;
  return json({ ok: true });
});
