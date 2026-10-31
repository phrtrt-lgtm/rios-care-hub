// create-bloqueio-pix — bloqueio de datas para uso pessoal do proprietário,
// pago com PIX (PLANO_IA_AGENTE.md §4, Fase 5).
//
// Corpo: { property_id, start_date (entrada), end_date (saída), notes? }
// Faz, nesta ordem:
//   1. confere acesso ao imóvel (dono/membro por has_property_access; equipe passa);
//   2. valida as datas (de hoje em diante, 1 a 30 noites);
//   3. confere que as noites estão livres: reservas aceitas no cache, pedidos
//      de bloqueio abertos e o calendário ao vivo da Hostex;
//   4. pega a taxa de limpeza: properties.taxa_limpeza_cents, senão o
//      cleaning_fee do anúncio na Hostex (quando > 0; guardado no imóvel);
//   5. grava o pedido como `aguardando_pagamento` e cria o PIX no Mercado
//      Pago (external_reference "bloqueio:<id>", expira em 30 min).
// Quem bloqueia na Hostex é o mercadopago-webhook, depois de conferir o valor.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { exigirPapel } from "../_shared/auth-guard.ts";
import { hostexGet } from "../_shared/hostexReserva.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const diaNum = (d: string) => {
  const [a, m, dd] = d.split("-").map(Number);
  return Date.UTC(a, m - 1, dd) / 86400000;
};
const dataDe = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);
const hojeBrasilia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const dataBR = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};
const MAX_NOITES = 30;
const PIX_MINUTOS = 30;

type Linha = Record<string, any>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const { autor, resposta } = await exigirPapel(req, ["owner", "admin", "agent", "maintenance"], corsHeaders);
  if (resposta) return resposta;
  if (!autor) return json({ error: "Não autenticado." }, 401);
  const equipe = autor.role !== "owner";

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const mpToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  const hostexKey = Deno.env.get("HOSTEX_API_KEY");
  if (!mpToken) return json({ error: "Pagamento indisponível: Mercado Pago não configurado." }, 503);

  const corpo = (await req.json().catch(() => ({}))) as Linha;
  const propertyId = String(corpo.property_id ?? "");
  const inicio = String(corpo.start_date ?? "");
  const fim = String(corpo.end_date ?? "");
  const notes = typeof corpo.notes === "string" ? corpo.notes.trim().slice(0, 1000) : null;

  if (!/^[0-9a-f-]{36}$/i.test(propertyId)) return json({ error: "Imóvel inválido." }, 400);
  if (!DATA_RE.test(inicio) || !DATA_RE.test(fim)) return json({ error: "Datas inválidas." }, 400);
  const hoje = hojeBrasilia();
  if (inicio < hoje) return json({ error: "A entrada precisa ser hoje ou depois." }, 400);
  const noites = diaNum(fim) - diaNum(inicio);
  if (noites < 1) return json({ error: "A saída precisa ser depois da entrada." }, 400);
  if (noites > MAX_NOITES) return json({ error: `No máximo ${MAX_NOITES} noites por pedido.` }, 400);
  const ultimaNoite = dataDe(diaNum(fim) - 1);

  // 1. acesso
  if (!equipe) {
    const { data: ok } = await supabase.rpc("has_property_access", { _user_id: autor.id, _property_id: propertyId });
    if (ok !== true) return json({ error: "Você não tem acesso a esse imóvel." }, 403);
  }
  const { data: imovel } = await supabase
    .from("properties")
    .select("id, name, owner_id, taxa_limpeza_cents, archived_at")
    .eq("id", propertyId)
    .maybeSingle();
  if (!imovel || imovel.archived_at) return json({ error: "Imóvel não encontrado." }, 404);

  // 2. conflitos no portal
  const { data: reservas } = await supabase
    .from("hostex_reservations")
    .select("check_in_date, check_out_date")
    .eq("property_id", propertyId)
    .in("status", ["accepted", "confirmed"])
    .lt("check_in_date", fim)
    .gt("check_out_date", inicio)
    .limit(1);
  if ((reservas ?? []).length > 0) {
    return json({ error: "Há uma reserva de hóspede nesse período. Escolha outras datas.", codigo: "ocupado" }, 409);
  }
  const limiteAguardando = new Date(Date.now() - 60 * 60_000).toISOString();
  const { data: pedidos } = await supabase
    .from("date_block_requests")
    .select("id, status, created_at")
    .eq("property_id", propertyId)
    .in("status", ["pending", "processed", "aguardando_pagamento", "pago_pendente_hostex"])
    .lt("start_date", fim)
    .gt("end_date", inicio)
    .limit(5);
  const conflito = (pedidos ?? []).find((p: Linha) => p.status !== "aguardando_pagamento" || p.created_at > limiteAguardando);
  if (conflito) {
    return json({ error: "Já existe um pedido de bloqueio nesse período para este imóvel.", codigo: "ocupado" }, 409);
  }

  // 3. calendário ao vivo da Hostex
  const { data: hx } = await supabase
    .from("hostex_properties")
    .select("id_hostex, raw")
    .eq("property_id", propertyId)
    .limit(1)
    .maybeSingle();
  const idHostex = hx?.id_hostex ? Number(hx.id_hostex) : null;
  if (idHostex && hostexKey) {
    try {
      const resp = await hostexGet("/availabilities", { property_ids: idHostex, start_date: inicio, end_date: ultimaNoite }, hostexKey);
      const dias: Linha[] = resp?.data?.properties?.[0]?.availabilities ?? [];
      const fechado = dias.find((d) => d.available === false);
      if (fechado) {
        return json({ error: `O calendário da Hostex está fechado em ${dataBR(String(fechado.date))}. Escolha outras datas.`, codigo: "ocupado" }, 409);
      }
    } catch (e) {
      console.error("[create-bloqueio-pix] hostex availabilities:", e);
      return json({ error: "Não consegui conferir o calendário da Hostex agora. Tente de novo em instantes." }, 503);
    }
  }

  // 4. taxa de limpeza
  let taxa: number | null = typeof imovel.taxa_limpeza_cents === "number" ? imovel.taxa_limpeza_cents : null;
  if (!taxa && hostexKey) {
    const canais: Linha[] = Array.isArray(hx?.raw?.channels) ? hx.raw.channels : [];
    for (const canal of canais) {
      if (!canal?.listing_id) continue;
      try {
        const resp = await hostexGet("/listings", { listing_id: String(canal.listing_id), limit: 1 }, hostexKey);
        const fee = Number(resp?.data?.listings?.[0]?.metadata?.price_list?.[0]?.cleaning_fee ?? 0);
        if (Number.isFinite(fee) && fee > 0) {
          taxa = Math.round(fee); // a Hostex devolve centavos (daily_price 15000 = R$ 150,00)
          await supabase.from("properties").update({ taxa_limpeza_cents: taxa }).eq("id", propertyId);
          break;
        }
      } catch (e) {
        console.warn("[create-bloqueio-pix] cleaning_fee da Hostex:", e);
      }
    }
  }
  if (!taxa || taxa < 100) {
    return json({
      error: "A taxa de limpeza deste imóvel ainda não está cadastrada. Avise a equipe RIOS para cadastrar e tente de novo.",
      codigo: "sem_taxa",
    }, 422);
  }

  // 5. pedido + PIX
  const ownerId = equipe ? imovel.owner_id : autor.id;
  const { data: dono } = await supabase.from("profiles").select("name, email").eq("id", ownerId).maybeSingle();
  const { data: pedido, error: erroPedido } = await supabase
    .from("date_block_requests")
    .insert({
      property_id: propertyId,
      owner_id: ownerId,
      start_date: inicio,
      end_date: fim,
      reason: "family_visit",
      notes,
      status: "aguardando_pagamento",
      valor_cents: taxa,
    })
    .select("id")
    .single();
  if (erroPedido || !pedido) {
    console.error("[create-bloqueio-pix] insert:", erroPedido?.message);
    return json({ error: "Não consegui registrar o pedido." }, 500);
  }

  const expira = new Date(Date.now() + PIX_MINUTOS * 60_000);
  const descricao = `Taxa de limpeza — bloqueio ${imovel.name} ${dataBR(inicio)} a ${dataBR(fim)}`;
  const mpResp = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mpToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      transaction_amount: Math.round(taxa) / 100,
      description: descricao.slice(0, 120),
      payment_method_id: "pix",
      payer: { email: dono?.email ?? "proprietario@rioshospedagens.com.br", first_name: (dono?.name ?? "Proprietário").split(" ")[0] },
      metadata: { type: "bloqueio_datas", bloqueio_id: pedido.id, property_id: propertyId },
      external_reference: `bloqueio:${pedido.id}`,
      notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook`,
      date_of_expiration: expira.toISOString(),
    }),
  });
  if (!mpResp.ok) {
    const txt = await mpResp.text();
    console.error("[create-bloqueio-pix] Mercado Pago:", mpResp.status, txt.slice(0, 500));
    await supabase.from("date_block_requests").update({ status: "expirado", erro_hostex: `PIX não gerado (MP ${mpResp.status})` }).eq("id", pedido.id);
    return json({ error: "Não consegui gerar o PIX agora. Tente de novo em instantes." }, 502);
  }
  const pagamento = await mpResp.json();
  const qr = pagamento?.point_of_interaction?.transaction_data?.qr_code ?? null;
  const qrBase64 = pagamento?.point_of_interaction?.transaction_data?.qr_code_base64 ?? null;
  await supabase
    .from("date_block_requests")
    .update({
      mercadopago_payment_id: String(pagamento.id),
      pix_qr_code: qr,
      pix_qr_code_base64: qrBase64,
      pix_expira_em: expira.toISOString(),
    })
    .eq("id", pedido.id);

  return json({
    id: pedido.id,
    imovel: imovel.name,
    noites,
    valor_cents: taxa,
    pix_qr_code: qr,
    pix_qr_code_base64: qrBase64 ? `data:image/png;base64,${qrBase64}` : null,
    pix_expira_em: expira.toISOString(),
  });
});
