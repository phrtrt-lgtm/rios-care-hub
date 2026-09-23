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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { exigirPapel } from "../_shared/auth-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-token",
};

const CENTRAL_URL = "https://gxsdefecwamziirfbzlk.supabase.co/functions/v1/notificar";
const TEMPLATE = "cobranca_proprietario";

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
  let body: { cobranca_id?: string; reenviar?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo inválido." }, 400);
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
  const totalAPagar = custoCheio - (cobranca.management_contribution_cents ?? 0);

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
