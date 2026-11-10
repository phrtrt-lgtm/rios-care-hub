// create-bloqueio-pix — bloqueio de datas para uso pessoal do proprietário
// (PLANO_IA_AGENTE.md §4, Fase 5). Três modos de limpeza (`limpeza` no corpo):
//   - "pix" (padrão): paga a taxa de limpeza por PIX;
//   - "entrega_limpo" (desde 2026-11-10, pedido do gestor): não paga agora. A
//     RIOS limpa antes da entrada, ele devolve o imóvel limpo para os próximos
//     hóspedes e se compromete a pagar a taxa de limpeza se a RIOS julgar o
//     imóvel inadequado. Canal "PROPRIETÁRIO - PEDIU PRA LIMPAR E DISSE QUE IA
//     ENTREGAR LIMPO(NÃO PAGOU TAXA)";
//   - "sem_limpeza" (desde 2026-11-10, pedido do gestor): não paga nada,
//     aceita receber o imóvel como estiver e a limpeza é feita só na saída.
//     Canal "PROPRIETÁRIO - NÃO PEDIU LIMPEZA/LIMPAR NA SAÍDA".
// Nos dois modos sem PIX a reserva direta nasce aqui mesmo, na hora.
//
// Corpo: { property_id, start_date (entrada), end_date (saída), notes?, limpeza? }
// Faz, nesta ordem:
//   1. confere acesso ao imóvel (dono/membro por has_property_access; equipe passa);
//   2. valida as datas (de hoje em diante, 1 a 30 noites);
//   3. confere que as noites estão livres: reservas aceitas no cache, pedidos
//      de bloqueio abertos e o calendário ao vivo da Hostex;
//   4. modos sem PIX: grava o pedido como `pending` e cria a reserva direta na
//      Hostex na hora → `processed`. Sem o canal próprio, usa o "PROPRIETÁRIO"
//      comum (o aviso segue no nome do hóspede); sem reserva, fecha por
//      disponibilidade; se nem isso der, o pedido fica `pending` na fila da
//      equipe (/admin/bloqueios-datas) com o motivo em `erro_hostex`. Em
//      "entrega_limpo", `valor_cents` guarda a taxa do imóvel (o valor do
//      compromisso), sem pagamento;
//   5. modo "pix": pega a taxa (properties.taxa_limpeza_cents, senão o
//      cleaning_fee do anúncio na Hostex quando > 0; guardado no imóvel),
//      grava o pedido como `aguardando_pagamento` e cria o PIX no Mercado
//      Pago (external_reference "bloqueio:<id>", expira em 30 min).
// No caminho pago quem bloqueia na Hostex é o mercadopago-webhook, depois de
// conferir o valor: cria uma reserva direta em nome de "Proprietário" (desde
// 2026-11-01), que a equipe de limpeza vê no app; se não der, fecha por
// disponibilidade.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { exigirPapel } from "../_shared/auth-guard.ts";
import { hostexGet, hostexPost } from "../_shared/hostexReserva.ts";
import { CANAL_ESPERADO, type TipoInterno, chaveIdempotente, criarReservaInterna } from "../_shared/reservaInterna.ts";

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

type ModoLimpeza = "pix" | "entrega_limpo" | "sem_limpeza";
const MODOS: ModoLimpeza[] = ["pix", "entrega_limpo", "sem_limpeza"];
const TIPO_DA_RESERVA: Record<Exclude<ModoLimpeza, "pix">, TipoInterno> = {
  entrega_limpo: "proprietario_entrega_limpo",
  sem_limpeza: "proprietario_sem_limpeza",
};
const reais = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;

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

  const corpo = (await req.json().catch(() => ({}))) as Linha;
  const modoPedido = corpo.limpeza === undefined || corpo.limpeza === null ? "pix" : String(corpo.limpeza);
  if (!MODOS.includes(modoPedido as ModoLimpeza)) return json({ error: "Opção de limpeza inválida." }, 400);
  const modo = modoPedido as ModoLimpeza;
  if (modo === "pix" && !mpToken) return json({ error: "Pagamento indisponível: Mercado Pago não configurado." }, 503);
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

  const ownerId = equipe ? imovel.owner_id : autor.id;

  // 4. modos sem PIX (entrega limpo / sem limpeza): a reserva nasce agora.
  if (modo !== "pix") {
    const agora = new Date().toISOString();
    // Entrega limpo: a taxa do imóvel hoje é o valor do compromisso (pode não estar cadastrada).
    const taxaCompromisso =
      modo === "entrega_limpo" && typeof imovel.taxa_limpeza_cents === "number" && imovel.taxa_limpeza_cents > 0
        ? Math.round(imovel.taxa_limpeza_cents)
        : null;
    const { data: pedidoSem, error: erroSem } = await supabase
      .from("date_block_requests")
      .insert({
        property_id: propertyId,
        owner_id: ownerId,
        start_date: inicio,
        end_date: fim,
        reason: "family_visit",
        notes,
        status: "pending",
        limpeza: modo,
        limpeza_aceito_em: agora,
        valor_cents: taxaCompromisso,
        ...(equipe ? { criado_por: autor.id } : {}),
      })
      .select("id")
      .single();
    if (erroSem || !pedidoSem) {
      console.error(`[create-bloqueio-pix] insert ${modo}:`, erroSem?.message);
      return json({ error: "Não consegui registrar o pedido." }, 500);
    }
    const idPedido = String(pedidoSem.id);
    const tipo = TIPO_DA_RESERVA[modo];
    // valor_cents = o que foi cobrado agora (nada); taxa_compromisso_cents = o que ele paga se o imóvel não voltar adequado.
    const base = { id: idPedido, imovel: imovel.name, noites, limpeza: modo, valor_cents: 0, taxa_compromisso_cents: taxaCompromisso };
    const instrucao =
      modo === "sem_limpeza"
        ? "USO DO PROPRIETÁRIO SEM LIMPEZA ANTES DA ENTRADA: ele não pagou a taxa de limpeza e aceitou receber o imóvel como estiver. LIMPAR NA SAÍDA."
        : `USO DO PROPRIETÁRIO, LIMPAR ANTES DA ENTRADA: ele pediu a limpeza, NÃO PAGOU A TAXA e disse que entrega o imóvel limpo para os próximos hóspedes. CONFERIR NA SAÍDA: se a RIOS julgar o imóvel inadequado, ele se comprometeu a pagar a taxa de limpeza${taxaCompromisso ? ` (${reais(taxaCompromisso)})` : ""}.`;
    const remarks = [
      instrucao,
      `Pedido pelo portal RIOS (${idPedido})${equipe ? ", registrado pela equipe" : ""}.`,
      notes ? `Obs.: ${notes.slice(0, 400)}` : "",
    ].filter(Boolean).join(" ");

    let problema: string | null = null;
    if (!hostexKey) problema = "HOSTEX_API_KEY não configurada";
    else if (!idHostex || !Number.isInteger(idHostex)) problema = "imóvel sem propriedade vinculada na Hostex";
    if (!problema && hostexKey && idHostex) {
      try {
        const r = await criarReservaInterna({
          apiKey: hostexKey,
          idHostex,
          checkIn: inicio,
          checkOut: fim,
          tipo,
          remarks,
          chave: chaveIdempotente(idPedido),
        });
        await supabase.from("date_block_requests").update({
          status: "processed",
          processed_at: agora,
          hostex_request_id: r.request_id,
          hostex_reservation_code: r.reservation_code,
          hostex_guest_name: r.guest_name,
          hostex_bloqueado_em: agora,
          erro_hostex: r.canal_generico
            ? `Falta o canal "${CANAL_ESPERADO[tipo]}" na Hostex; a reserva foi para o canal "${r.custom_channel.name}" (o aviso à limpeza está no nome do hóspede).`
            : null,
        }).eq("id", idPedido);
        return json({
          ...base,
          status: "processed",
          reserva: r.reservation_code,
          nome_na_hostex: r.guest_name,
          canal: r.custom_channel.name,
          canal_generico: r.canal_generico,
        });
      } catch (eReserva) {
        // Sem a reserva direta, fecha o calendário (vale para Airbnb e Booking)
        // e deixa anotado: a limpeza não vê bloqueio por disponibilidade.
        const motivo = eReserva instanceof Error ? eReserva.message : String(eReserva);
        console.error(`[create-bloqueio-pix] reserva ${modo} falhou:`, motivo);
        try {
          const resp = await hostexPost(
            "/availabilities",
            { property_ids: [idHostex], start_date: inicio, end_date: ultimaNoite, available: false },
            hostexKey,
          );
          await supabase.from("date_block_requests").update({
            status: "processed",
            processed_at: agora,
            hostex_request_id: resp?.request_id ?? null,
            hostex_bloqueado_em: agora,
            erro_hostex: `Reserva de proprietário (${modo === "sem_limpeza" ? "sem limpeza" : "entrega limpo, não pagou taxa"}) não criada (${motivo.slice(0, 300)}); datas fechadas por disponibilidade, sem reserva para a limpeza.`,
          }).eq("id", idPedido);
          return json({ ...base, status: "processed", reserva: null, aviso: "Datas fechadas no calendário; a equipe RIOS registra a reserva para a limpeza." });
        } catch (eDisp) {
          problema = `${motivo.slice(0, 250)} | disponibilidade: ${(eDisp instanceof Error ? eDisp.message : String(eDisp)).slice(0, 200)}`;
        }
      }
    }
    // Nada foi bloqueado na Hostex: o pedido fica na fila da equipe.
    console.error(`[create-bloqueio-pix] ${modo}, Hostex não bloqueou:`, problema);
    await supabase.from("date_block_requests").update({ erro_hostex: String(problema).slice(0, 500) }).eq("id", idPedido);
    return json({ ...base, status: "pending", reserva: null, aviso: "Pedido registrado; a equipe RIOS conclui o bloqueio no calendário." });
  }

  // 5. taxa de limpeza
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

  // 6. pedido + PIX
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
    limpeza: "pix",
    valor_cents: taxa,
    pix_qr_code: qr,
    pix_qr_code_base64: qrBase64 ? `data:image/png;base64,${qrBase64}` : null,
    pix_expira_em: expira.toISOString(),
  });
});
