// pricelabs-sync — média do mercado (PriceLabs) para a página de resultados.
//
// Uma chamada de neighborhood_data por listagem devolve a ocupação e a diária
// do mercado em volta do imóvel, mês a mês (histórico desde 2024 e o que já
// está reservado à frente). Guardamos só o resumo mensal em mercado_mensal;
// a página nunca chama o PriceLabs.
//
// Custo: uma chamada por listagem por dia. O cron roda de hora em hora e cada
// rodada atualiza no máximo LOTE listagens, sempre as mais antigas e só as com
// mais de INTERVALO_HORAS desde a última coleta — assim as ~55 listagens se
// espalham por algumas rodadas e nenhuma execução passa do tempo limite.
//
// Segredo necessário: PRICELABS_API_KEY (Settings → API details no PriceLabs).
// Chamada: cron com ?token=… (mesmo token dos outros crons) ou JWT de equipe.
// Parâmetros opcionais: ?lote=N (quantas listagens), ?tudo=1 (ignora o
// intervalo e recolhe todas que couberem no lote), ?listing_id=… (só uma).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { exigirPapel } from "../_shared/auth-guard.ts";
import { idHostexDaListagem, linhasDoMercado } from "./parse.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRICELABS = "https://api.pricelabs.co/v1";
const LOTE_PADRAO = 15;
const LOTE_MAXIMO = 40;
const INTERVALO_HORAS = 20;
/** Pausa entre chamadas, para não bater no limite de requisições do PriceLabs. */
const PAUSA_MS = 1500;

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pricelabs(caminho: string, chave: string, tentativa = 0): Promise<any> {
  const resp = await fetch(`${PRICELABS}${caminho}`, {
    headers: { "X-API-Key": chave, Accept: "application/json" },
  });
  if (resp.status === 429 && tentativa < 2) {
    // limite de requisições: espera e tenta de novo
    await dormir(15_000 * (tentativa + 1));
    return pricelabs(caminho, chave, tentativa + 1);
  }
  const texto = await resp.text();
  if (!resp.ok) throw new Error(`pricelabs_${resp.status} em ${caminho.split("?")[0]}: ${texto.slice(0, 200)}`);
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error(`pricelabs_resposta_invalida em ${caminho.split("?")[0]}: ${texto.slice(0, 120)}`);
  }
}

/** A API devolve ora { listings: [...] }, ora a lista direta. */
function listaDe(payload: any, chave: string): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.[chave])) return payload[chave];
  if (Array.isArray(payload?.data?.[chave])) return payload.data[chave];
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  let body: any = {};
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch {
      /* sem corpo */
    }
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ---- quem pode chamar: o cron (token) ou alguém da equipe (JWT)
  const tokenParam = url.searchParams.get("token") || req.headers.get("x-cron-token");
  let tokenDeCron = !!Deno.env.get("CRON_SECRET_TOKEN") && tokenParam === Deno.env.get("CRON_SECRET_TOKEN");
  if (!tokenDeCron && tokenParam) {
    const { data: cfg } = await supabase.from("system_config").select("value").eq("key", "charge_cron_token").maybeSingle();
    const doConfig = typeof cfg?.value === "string" ? cfg.value.replace(/^"|"$/g, "") : null;
    tokenDeCron = !!doConfig && tokenParam === doConfig;
  }
  if (!tokenDeCron) {
    const { resposta } = await exigirPapel(req, ["admin", "agent"], corsHeaders);
    if (resposta) return resposta;
  }

  const chave = Deno.env.get("PRICELABS_API_KEY");
  const { data: logRow } = await supabase
    .from("pricelabs_sync_log")
    .insert({ status: "running", triggered_by: tokenDeCron ? "cron" : "manual" })
    .select("id")
    .single();
  const logId = logRow?.id as string | undefined;
  const fecharLog = async (patch: Record<string, unknown>) => {
    if (logId) await supabase.from("pricelabs_sync_log").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", logId);
  };

  if (!chave) {
    await fecharLog({ status: "error", error_message: "missing_api_key" });
    return json({ error: "missing_api_key" }, 500);
  }

  const loteParam = Number(url.searchParams.get("lote") ?? body?.lote);
  const lote = Number.isFinite(loteParam) && loteParam > 0 ? Math.min(Math.floor(loteParam), LOTE_MAXIMO) : LOTE_PADRAO;
  const tudo = url.searchParams.get("tudo") === "1" || body?.tudo === true;
  const soUma = url.searchParams.get("listing_id") || body?.listing_id || null;

  let total = 0;
  let ok = 0;
  let linhasGravadas = 0;
  const falhas: string[] = [];

  try {
    // 1) Listagens do PriceLabs (só as da Hostex) e vínculo com o imóvel local
    const payloadListagens = await pricelabs("/listings", chave);
    const listagens = listaDe(payloadListagens, "listings")
      .map((l: any) => ({
        id: String(l.id ?? l.listing_id ?? ""),
        pms: String(l.pms ?? l.pms_name ?? ""),
        nome: String(l.name ?? l.listing_name ?? ""),
      }))
      .filter((l) => l.id && l.pms.toLowerCase() === "hostex");
    total = listagens.length;

    const [{ data: hx }, { data: locais }, { data: ultimas }] = await Promise.all([
      supabase.from("hostex_properties").select("id_hostex, property_id"),
      supabase.from("properties").select("id, name"),
      supabase.from("mercado_mensal").select("listing_id, synced_at").order("synced_at", { ascending: false }),
    ]);
    const porIdHostex = new Map<string, string | null>();
    for (const h of hx || []) porIdHostex.set(String(h.id_hostex), h.property_id ?? null);
    const porNome = new Map<string, string>();
    for (const p of locais || []) if (p.name) porNome.set(norm(p.name), p.id);
    const ultimaColeta = new Map<string, string>();
    for (const u of ultimas || []) if (!ultimaColeta.has(u.listing_id)) ultimaColeta.set(u.listing_id, u.synced_at);

    const imovelDe = (l: { id: string; nome: string }) => {
      const idHostex = idHostexDaListagem(l.id);
      return (idHostex && porIdHostex.get(idHostex)) || porNome.get(norm(l.nome)) || null;
    };

    // 2) Quem entra nesta rodada: as mais antigas, só as vencidas (salvo ?tudo=1)
    const limite = Date.now() - INTERVALO_HORAS * 3_600_000;
    const fila = listagens
      .filter((l) => !soUma || l.id === soUma)
      .filter((l) => soUma || tudo || !ultimaColeta.has(l.id) || new Date(ultimaColeta.get(l.id)!).getTime() < limite)
      .sort((a, b) => (ultimaColeta.get(a.id) ?? "").localeCompare(ultimaColeta.get(b.id) ?? ""))
      .slice(0, lote);

    // 3) Uma chamada por listagem; o resumo mensal entra em mercado_mensal
    const hoje = new Date();
    for (const [i, l] of fila.entries()) {
      if (i > 0) await dormir(PAUSA_MS);
      try {
        const dados = await pricelabs(`/neighborhood_data?pms=hostex&listing_id=${encodeURIComponent(l.id)}`, chave);
        const linhas = linhasDoMercado(dados?.data ?? dados, hoje);
        if (linhas.length === 0) throw new Error("sem_dados");
        const propertyId = imovelDe(l);
        const agora = new Date().toISOString();
        const { error } = await supabase.from("mercado_mensal").upsert(
          linhas.map((r) => ({ listing_id: l.id, pms: "hostex", property_id: propertyId, ...r, synced_at: agora })),
          { onConflict: "listing_id,categoria,mes" },
        );
        if (error) throw new Error(`upsert: ${error.message}`);
        linhasGravadas += linhas.length;
        ok += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[pricelabs-sync] ${l.nome} (${l.id}): ${msg}`);
        falhas.push(`${l.nome}: ${msg.slice(0, 120)}`);
      }
    }

    await fecharLog({
      status: falhas.length && ok === 0 ? "error" : "ok",
      listings_total: total,
      listings_synced: ok,
      rows_upserted: linhasGravadas,
      error_message: falhas.length ? falhas.join(" | ").slice(0, 1000) : null,
    });
    return json({ ok: true, listagens: total, nesta_rodada: fila.length, atualizadas: ok, linhas: linhasGravadas, falhas });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("[pricelabs-sync] falhou:", msg);
    await fecharLog({ status: "error", error_message: msg, listings_total: total, listings_synced: ok, rows_upserted: linhasGravadas });
    return json({ error: msg }, 500);
  }
});
