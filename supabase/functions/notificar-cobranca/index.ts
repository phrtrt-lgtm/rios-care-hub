// notificar-cobranca — avisa o proprietário por WhatsApp quando uma cobrança
// é enviada a ele.
//
// Chamada por:
//   - trigger trg_notificar_cobranca_whatsapp em public.charges (via pg_net),
//     com header x-internal-token (token guardado no Vault, conferido por
//     public.verificar_token_interno);
//   - admin autenticado, pelo botão "Reenviar WhatsApp" na tela da cobrança.
// Nunca é pública.
//
// O envio em si passa pela função central de WhatsApp (outro projeto), que
// fala com a Meta. Este projeto não chama graph.facebook.com.
//
// Falha no WhatsApp nunca desfaz nem bloqueia a cobrança: o resultado só é
// gravado em charges.whatsapp_*.
//
// Lembrete de atraso (modelo cobranca_atraso_proprietario): UM por proprietário,
// resumindo todas as cobranças dele em atraso (public.cobrancas_em_atraso).
//   - { tipo: "atraso", proprietario_id }  -> admin (botão/lote na lista) ou interno;
//   - { lote_atraso: true }                -> só interno (cron diário, via
//     disparar_lembretes_atraso_whatsapp); respeita whatsapp_lembrete_config e
//     envia um proprietário por vez, com intervalo.
// Resultado gravado em charges.whatsapp_lembrete_* de cada cobrança incluída.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { exigirPapel } from "../_shared/auth-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-token",
};

const CENTRAL_URL = "https://gxsdefecwamziirfbzlk.supabase.co/functions/v1/notificar";
const TEMPLATE = "cobranca_proprietario";
const TEMPLATE_ATRASO = Deno.env.get("TEMPLATE_ATRASO") ?? "cobranca_atraso_proprietario";
/** Pausa entre um proprietário e outro no lote automático. */
const INTERVALO_LOTE_MS = 5000;

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** 125000 -> "1.250,00" (sem "R$": o template já tem). */
const formatarValor = (centavos: number) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Math.max(0, centavos) / 100);

const primeiroNome = (nome: string | null | undefined) =>
  (nome || "").trim().split(/\s+/)[0] || "Proprietário";

/** "2026-09-25" -> "25/09/2026" */
const dataBR = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

/** Hoje no fuso do Brasil, "yyyy-mm-dd". */
const hojeBR = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

const diasEntre = (deIso: string, ateIso: string) =>
  Math.round((Date.parse(ateIso.slice(0, 10)) - Date.parse(deIso.slice(0, 10))) / 86_400_000);

type ResultadoEnvio = { ok: boolean; messageId: string | null; erro: string | null };

/** Envia um modelo pela função central de WhatsApp. Nunca lança. */
async function enviarCentral(template: string, params: string[], telefone: string): Promise<ResultadoEnvio> {
  const chave = Deno.env.get("NOTIFICAR_KEY");
  if (!chave) return { ok: false, messageId: null, erro: "NOTIFICAR_KEY não configurada neste projeto." };
  try {
    const resp = await fetch(CENTRAL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-rios-key": chave },
      body: JSON.stringify({ template, params, para: [telefone] }),
    });
    const texto = await resp.text();
    let dados: any = null;
    try { dados = JSON.parse(texto); } catch { /* resposta não-JSON */ }
    const resultado = dados?.resultados?.[0];
    if (resp.ok && resultado?.ok) return { ok: true, messageId: resultado.id ?? null, erro: null };
    const erro = resultado?.erro || dados?.error || dados?.erro || `HTTP ${resp.status}: ${texto.slice(0, 300)}`;
    return { ok: false, messageId: null, erro: typeof erro === "string" ? erro : JSON.stringify(erro) };
  } catch (e) {
    return { ok: false, messageId: null, erro: `Falha de rede ao chamar a função central: ${(e as Error).message}` };
  }
}

type Supa = ReturnType<typeof createClient>;

/**
 * Lembrete de atraso para UM proprietário, resumindo todas as cobranças dele em
 * atraso. Grava o resultado em cada cobrança incluída.
 */
async function lembrarAtraso(supabase: Supa, ownerId: string) {
  const { data: atrasadas, error } = await supabase.rpc("cobrancas_em_atraso", { p_owner: ownerId });
  if (error) return { status: "falhou", erro: error.message };
  const lista = (atrasadas ?? []) as {
    id: string;
    a_pagar_cents: number;
    due_date: string;
    whatsapp_lembretes_enviados: number;
  }[];
  if (lista.length === 0) return { status: "sem_atraso" };

  const ids = lista.map((c) => c.id);
  const gravarTodas = async (campos: Record<string, unknown>) => {
    const { error: e } = await supabase.from("charges").update(campos).in("id", ids);
    if (e) console.error("[notificar-cobranca] falha ao gravar lembrete", ownerId, e.message);
  };

  const { data: dono } = await supabase
    .from("profiles")
    .select("name, phone, notificar_whatsapp")
    .eq("id", ownerId)
    .maybeSingle();

  if (!dono?.notificar_whatsapp) {
    await gravarTodas({ whatsapp_lembrete_status: "desativado", whatsapp_lembrete_erro: null });
    return { status: "desativado" };
  }
  const telefone = (dono.phone || "").replace(/\D/g, "");
  if (telefone.length < 10) {
    await gravarTodas({ whatsapp_lembrete_status: "falhou", whatsapp_lembrete_erro: "Proprietário sem WhatsApp cadastrado." });
    return { status: "falhou", erro: "sem_telefone" };
  }

  const total = lista.reduce((soma, c) => soma + Number(c.a_pagar_cents), 0);
  const maisAntiga = lista.map((c) => c.due_date).filter(Boolean).sort()[0] ?? hojeBR();
  const dias = Math.max(1, diasEntre(maisAntiga, hojeBR()));
  const quantidade = lista.length === 1 ? "1 cobrança em atraso" : `${lista.length} cobranças em atraso`;

  const r = await enviarCentral(
    TEMPLATE_ATRASO,
    [primeiroNome(dono.name), quantidade, formatarValor(total), dataBR(maisAntiga), String(dias)],
    telefone,
  );

  if (!r.ok) {
    await gravarTodas({ whatsapp_lembrete_status: "falhou", whatsapp_lembrete_erro: r.erro });
    console.warn(`[notificar-cobranca] lembrete falhou owner=${ownerId}: ${r.erro}`);
    return { status: "falhou", erro: r.erro };
  }

  const agora = new Date().toISOString();
  for (const c of lista) {
    await supabase
      .from("charges")
      .update({
        whatsapp_lembrete_status: "enviado",
        whatsapp_lembrete_enviado_em: agora,
        whatsapp_lembrete_erro: null,
        whatsapp_lembretes_enviados: (c.whatsapp_lembretes_enviados ?? 0) + 1,
      })
      .eq("id", c.id);
  }
  console.log(`[notificar-cobranca] lembrete enviado owner=${ownerId} cobrancas=${lista.length}`);
  return { status: "enviado", message_id: r.messageId, cobrancas: lista.length, total_cents: total };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // --- Autenticação: token do trigger OU admin -------------------------------
  const tokenInterno = req.headers.get("x-internal-token");
  let origem: "trigger" | "admin";

  if (tokenInterno) {
    const { data: valido, error } = await supabase.rpc("verificar_token_interno", {
      p_token: tokenInterno,
    });
    if (error || valido !== true) {
      console.warn("[notificar-cobranca] token interno invalido");
      return json({ error: "Não autorizado." }, 401);
    }
    origem = "trigger";
  } else {
    const { resposta } = await exigirPapel(req, ["admin"], corsHeaders);
    if (resposta) return resposta;
    origem = "admin";
  }

  // --- Entrada ----------------------------------------------------------------
  let body: {
    cobranca_id?: string;
    reenviar?: boolean;
    tipo?: "cobranca" | "atraso";
    proprietario_id?: string;
    lote_atraso?: boolean;
  } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo inválido." }, 400);
  }

  // --- Lote automático de lembretes de atraso (cron) ---------------------------
  if (body.lote_atraso) {
    if (origem !== "trigger") return json({ error: "Lote só pelo agendamento interno." }, 403);
    const { data: cfg } = await supabase.from("whatsapp_lembrete_config").select("ativo").maybeSingle();
    if (!cfg?.ativo) return json({ status: "desligado" });
    const { data: donos, error } = await supabase.rpc("proprietarios_para_lembrete_atraso", {});
    if (error) return json({ error: error.message }, 500);
    const ownerIds = ((donos ?? []) as { owner_id: string }[]).map((d) => d.owner_id);
    const tarefa = (async () => {
      for (const [i, ownerId] of ownerIds.entries()) {
        if (i > 0) await new Promise((r) => setTimeout(r, INTERVALO_LOTE_MS));
        try {
          await lembrarAtraso(supabase, ownerId);
        } catch (e) {
          console.error("[notificar-cobranca] lote: erro", ownerId, (e as Error).message);
        }
      }
      console.log(`[notificar-cobranca] lote de atraso concluído: ${ownerIds.length} proprietários`);
    })();
    // Responde já e segue enviando em segundo plano (o cron não espera).
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(tarefa);
    else await tarefa;
    return json({ status: "lote_iniciado", proprietarios: ownerIds.length }, 202);
  }

  // --- Lembrete de atraso para um proprietário (botão / lote da lista) --------
  if (body.tipo === "atraso") {
    if (!body.proprietario_id) return json({ error: "proprietario_id é obrigatório." }, 400);
    const r = await lembrarAtraso(supabase, body.proprietario_id);
    return json({ ...r, origem }, r.status === "falhou" ? 502 : 200);
  }

  const cobrancaId = body.cobranca_id;
  const reenviar = body.reenviar === true;
  if (!cobrancaId) return json({ error: "cobranca_id é obrigatório." }, 400);

  const gravar = async (campos: Record<string, unknown>) => {
    const { error } = await supabase.from("charges").update(campos).eq("id", cobrancaId);
    if (error) console.error("[notificar-cobranca] falha ao gravar status", cobrancaId, error.message);
  };

  // --- Cobrança, proprietário, imóvel ------------------------------------------
  const { data: cobranca, error: cobrancaErr } = await supabase
    .from("charges")
    .select("id, owner_id, property_id, amount_cents, management_contribution_cents, whatsapp_enviado_em")
    .eq("id", cobrancaId)
    .maybeSingle();

  if (cobrancaErr || !cobranca) return json({ error: "Cobrança não encontrada." }, 404);

  const { data: dono } = await supabase
    .from("profiles")
    .select("name, phone, notificar_whatsapp")
    .eq("id", cobranca.owner_id)
    .maybeSingle();

  if (!dono?.notificar_whatsapp) {
    await gravar({ whatsapp_status: "desativado", whatsapp_erro: null });
    return json({ status: "desativado", origem });
  }

  if (cobranca.whatsapp_enviado_em && !reenviar) {
    return json({ status: "ja_enviado", enviado_em: cobranca.whatsapp_enviado_em, origem });
  }

  const telefone = (dono.phone || "").replace(/\D/g, "");
  if (telefone.length < 10) {
    await gravar({ whatsapp_status: "falhou", whatsapp_erro: "Proprietário sem WhatsApp cadastrado." });
    return json({ status: "falhou", erro: "sem_telefone", origem });
  }

  let nomeImovel = "seu imóvel";
  if (cobranca.property_id) {
    const { data: imovel } = await supabase
      .from("properties")
      .select("name")
      .eq("id", cobranca.property_id)
      .maybeSingle();
    if (imovel?.name) nomeImovel = imovel.name;
  }

  const custoCheio = cobranca.amount_cents ?? 0;
  // Aporte da gestão pode passar do valor (cobrança dada de graça): a pagar é 0, nunca negativo.
  const totalAPagar = Math.max(0, custoCheio - (cobranca.management_contribution_cents ?? 0));

  const chave = Deno.env.get("NOTIFICAR_KEY");
  if (!chave) {
    await gravar({ whatsapp_status: "falhou", whatsapp_erro: "NOTIFICAR_KEY não configurada neste projeto." });
    return json({ status: "falhou", erro: "sem_chave", origem }, 500);
  }

  // --- Envio pela função central -------------------------------------------------
  const payload = {
    template: TEMPLATE,
    params: [
      primeiroNome(dono.name),
      nomeImovel,
      formatarValor(custoCheio),
      formatarValor(totalAPagar),
    ],
    para: [telefone],
  };

  let ok = false;
  let messageId: string | null = null;
  let erro: string | null = null;

  try {
    const resp = await fetch(CENTRAL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-rios-key": chave },
      body: JSON.stringify(payload),
    });
    const texto = await resp.text();
    let dados: any = null;
    try { dados = JSON.parse(texto); } catch { /* resposta não-JSON */ }

    const resultado = dados?.resultados?.[0];
    if (resp.ok && resultado?.ok) {
      ok = true;
      messageId = resultado.id ?? null;
    } else {
      erro = resultado?.erro || dados?.error || `HTTP ${resp.status}: ${texto.slice(0, 300)}`;
    }
  } catch (e) {
    erro = `Falha de rede ao chamar a função central: ${(e as Error).message}`;
  }

  if (ok) {
    await gravar({
      whatsapp_status: "enviado",
      whatsapp_enviado_em: new Date().toISOString(),
      whatsapp_message_id: messageId,
      whatsapp_erro: null,
    });
    console.log(`[notificar-cobranca] enviado cobranca=${cobrancaId} origem=${origem}`);
    return json({ status: "enviado", message_id: messageId, origem });
  }

  await gravar({ whatsapp_status: "falhou", whatsapp_erro: erro });
  console.warn(`[notificar-cobranca] falhou cobranca=${cobrancaId} origem=${origem}: ${erro}`);
  return json({ status: "falhou", erro, origem }, 502);
});
