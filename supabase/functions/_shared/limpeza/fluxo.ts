// deno-lint-ignore-file no-explicit-any
// Bloqueio de limpeza — a parte que lê a Hostex, grava o registro e escreve.
// As regras estão em `calculo.ts` (puro, testado); aqui só há entrada e saída.
//
// Por evento de reserva de um imóvel do escopo, com a flag ligada:
//   1. trava o imóvel (um evento por vez);
//   2. lê na API o estado atual da reserva e as accepted do imóvel: o payload
//      do webhook não traz status nem datas, e a ordem de chegada não é
//      garantida, então o que vale é o estado, nunca o tipo do evento;
//   3. `planejarBuffers` decide o que fechar, o que reabrir e o que só muda no
//      registro;
//   4. cada data é reservada no registro ANTES da escrita (índice único em
//      imóvel + data): dois eventos iguais nunca escrevem duas vezes;
//   5. escreve na Hostex por lista de datas, um imóvel por chamada;
//   6. ~20 s depois confere o calendário; divergiu, reenvia UMA vez; divergiu
//      de novo, vira `erro` no log e o registro é corrigido. Sem laço.
//
// Tabelas: cleaning_blocks (registro), cleaning_block_log (um por evento e
// imóvel), cleaning_block_locks (trava). Flag: system_config.limpeza_bloqueios.
import {
  bufferDeOutra,
  buffersDaReserva,
  type ConfigLimpeza,
  datasOk,
  dataValida,
  decidirEvento,
  type Descarte,
  ehNoiteVendida,
  hojeEm,
  idImovel,
  imovelLigado,
  imovelNoEscopo,
  lerConfig,
  lerEvento,
  planejarBuffers,
  type RegistroAtivo,
  type ReservaHostex,
  somarDias,
} from "./calculo.ts";
import {
  extractList,
  hostexDisponibilidade,
  hostexGet,
  hostexMudarDatas,
  hostexReservasAceitas,
} from "../hostexReserva.ts";

const CHAVE_CONFIG = "limpeza_bloqueios";
const ESPERA_VERIFICACAO_MS = 20_000;
const TRAVA_MS = 90_000;
const ESPERA_TRAVA_MS = 40_000;
const PRAZO_LEITURA_MS = 15_000;
/** Reabertura mandada há menos que isto ainda pode estar em trânsito na Hostex. */
const RECEM_LIBERADA_MS = 3 * 60_000;
const MAX_TENTATIVAS_VERIFICACAO = 4;
const MAX_IMOVEIS_POR_RESERVA = 4;

type Origem = "webhook" | "manual";
type Esperado = { date: string; available: boolean; block_id: string };
type Pedido = { origem: Origem; eventId: string | null; evento: string; codigo: string; propertyId: number | null };

const dormir = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
const agoraIso = () => new Date().toISOString();
const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));
const registrar = (dados: Record<string, unknown>) => console.log(JSON.stringify({ fluxo: "limpeza", ...dados }));
const alertar = (dados: Record<string, unknown>) => console.error(JSON.stringify({ fluxo: "limpeza", ...dados }));

/** Leitura na Hostex com prazo e uma segunda tentativa (leitura não muda nada, pode repetir). */
async function leitura<T>(rotulo: string, fn: () => Promise<T>): Promise<T> {
  let ultimo: unknown;
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    let relogio: ReturnType<typeof setTimeout> | undefined;
    try {
      const prazo = new Promise<never>((_, falha) => {
        relogio = setTimeout(() => falha(new Error(`${rotulo}: a Hostex não respondeu em ${PRAZO_LEITURA_MS / 1000} s`)), PRAZO_LEITURA_MS);
      });
      return await Promise.race([fn(), prazo]);
    } catch (e) {
      ultimo = e;
      if (tentativa < 2) await dormir(800);
    } finally {
      clearTimeout(relogio);
    }
  }
  throw ultimo;
}

function normalizar(r: any): ReservaHostex {
  const imovel = idImovel(r?.property_id);
  if (imovel === null) throw new Error(`reserva ${r?.reservation_code ?? "?"} veio sem property_id numérico da Hostex`);
  return {
    reservation_code: String(r?.reservation_code ?? ""),
    property_id: imovel,
    check_in_date: String(r?.check_in_date ?? ""),
    check_out_date: String(r?.check_out_date ?? ""),
    status: String(r?.status ?? ""),
  };
}

export async function lerConfigLimpeza(supabase: any): Promise<ConfigLimpeza> {
  const { data, error } = await supabase.from("system_config").select("value").eq("key", CHAVE_CONFIG).maybeSingle();
  if (error) throw new Error(`system_config: ${error.message}`);
  return lerConfig(data?.value);
}

// ------------------------------------------------------------------- trava

/** Um evento por imóvel de cada vez. A trava vence sozinha em 90 s se o processo morrer. */
async function travar(supabase: any, imovel: number): Promise<string> {
  const dono = crypto.randomUUID();
  const limite = Date.now() + ESPERA_TRAVA_MS;
  for (;;) {
    const agora = Date.now();
    await supabase.from("cleaning_block_locks").delete().eq("property_id", imovel).lt("locked_until", new Date(agora).toISOString());
    const { error } = await supabase
      .from("cleaning_block_locks")
      .insert({ property_id: imovel, holder: dono, locked_until: new Date(agora + TRAVA_MS).toISOString() });
    if (!error) return dono;
    if (error.code !== "23505") throw new Error(`cleaning_block_locks: ${error.message}`);
    if (Date.now() > limite) throw new Error(`imóvel ${imovel} ocupado por outro evento há mais de ${ESPERA_TRAVA_MS / 1000} s`);
    await dormir(700);
  }
}

async function destravar(supabase: any, imovel: number, dono: string) {
  await supabase.from("cleaning_block_locks").delete().eq("property_id", imovel).eq("holder", dono);
}

// ---------------------------------------------------------------- leituras

async function buscarEstadias(apiKey: string, codigo: string): Promise<ReservaHostex[]> {
  const resp = await leitura("reserva", () => hostexGet("/reservations", { reservation_code: codigo }, apiKey));
  return extractList(resp, "reservations")
    .filter((r: any) => String(r?.reservation_code ?? "") === codigo)
    .map(normalizar);
}

async function linhasAtivas(supabase: any, filtro: { imovel?: number; codigo?: string }): Promise<RegistroAtivo[]> {
  let q = supabase.from("cleaning_blocks").select("id, property_id, date, reservation_code, kind").is("released_at", null);
  if (filtro.imovel !== undefined) q = q.eq("property_id", filtro.imovel);
  if (filtro.codigo !== undefined) q = q.eq("reservation_code", filtro.codigo);
  const { data, error } = await q;
  if (error) throw new Error(`cleaning_blocks: ${error.message}`);
  return (data ?? []).map((l: any) => ({ ...l, property_id: Number(l.property_id) }));
}

/** Datas que este sistema mandou reabrir há poucos minutos (a reabertura pode não ter chegado ao calendário). */
async function recemLiberadas(supabase: any, imovel: number, datas: string[]): Promise<string[]> {
  const { data, error } = await supabase
    .from("cleaning_blocks")
    .select("date")
    .eq("property_id", imovel)
    .eq("release_sent", true)
    .in("date", datas)
    .gte("released_at", new Date(Date.now() - RECEM_LIBERADA_MS).toISOString());
  if (error) throw new Error(`cleaning_blocks: ${error.message}`);
  return (data ?? []).map((l: any) => String(l.date));
}

// ------------------------------------------------------------------ evento

/** Chamado pelo hostex-webhook para cada evento de reserva. Nunca lança. */
export async function processarEventoLimpeza(supabase: any, payload: unknown): Promise<void> {
  const ev = lerEvento(payload);
  const quem = { event_id: ev.eventId, evento: ev.evento, property_id: ev.propertyId, reservation_code: ev.reservationCode };
  try {
    const cfg = await lerConfigLimpeza(supabase);
    const decisao = decidirEvento(ev, cfg);
    if (!decisao.processar) {
      registrar({ resultado: "ignorado", ...quem, motivo: decisao.motivo });
      return;
    }
    await processarReserva(supabase, cfg, {
      origem: "webhook",
      eventId: ev.eventId,
      evento: ev.evento,
      codigo: ev.reservationCode,
      propertyId: ev.propertyId,
    });
  } catch (e) {
    alertar({ resultado: "erro", ...quem, erro: mensagem(e) });
  }
}

/** Reprocessa uma reserva à mão (modo interno do hostex-webhook). Mesmas regras e mesma flag do evento. */
export async function reprocessarReserva(supabase: any, codigo: string, propertyId: number | null): Promise<void> {
  try {
    const cfg = await lerConfigLimpeza(supabase);
    if (!cfg.ativo) {
      registrar({ resultado: "ignorado", evento: "reprocessar", reservation_code: codigo, motivo: "fluxo desligado" });
      return;
    }
    await processarReserva(supabase, cfg, { origem: "manual", eventId: null, evento: "reprocessar", codigo, propertyId });
  } catch (e) {
    alertar({ resultado: "erro", evento: "reprocessar", reservation_code: codigo, erro: mensagem(e) });
  }
}

async function processarReserva(supabase: any, cfg: ConfigLimpeza, pedido: Pedido): Promise<void> {
  const apiKey = Deno.env.get("HOSTEX_API_KEY");
  if (!apiKey) throw new Error("HOSTEX_API_KEY não configurada");

  const fila: number[] = [];
  if (pedido.propertyId !== null) fila.push(pedido.propertyId);
  else {
    // Reprocesso sem imóvel: onde a reserva está aceita e onde ela tem linha no registro.
    const estadias = await buscarEstadias(apiKey, pedido.codigo);
    for (const s of estadias) if (s.status === "accepted") fila.push(s.property_id);
    for (const l of await linhasAtivas(supabase, { codigo: pedido.codigo })) fila.push(l.property_id);
  }

  const vistos = new Set<number>();
  const aVerificar: string[] = [];
  while (fila.length > 0 && vistos.size < MAX_IMOVEIS_POR_RESERVA) {
    const imovel = fila.shift()!;
    if (vistos.has(imovel)) continue;
    vistos.add(imovel);
    if (!imovelLigado(cfg, imovel)) {
      registrar({
        resultado: "ignorado",
        event_id: pedido.eventId,
        evento: pedido.evento,
        property_id: imovel,
        reservation_code: pedido.codigo,
        motivo: imovelNoEscopo(imovel) ? `imóvel ${imovel} ainda não ligado na flag` : `imóvel ${imovel} fora do escopo`,
      });
      continue;
    }
    const r = await processarImovel(supabase, cfg, apiKey, pedido, imovel);
    if (r.verificar) aVerificar.push(r.logId);
    for (const outro of r.outrosImoveis) if (!vistos.has(outro)) fila.push(outro);
  }

  if (aVerificar.length > 0) {
    // A escrita na Hostex é assíncrona: confere depois de ~20 s.
    await dormir(ESPERA_VERIFICACAO_MS);
    for (const id of aVerificar) await verificarLog(supabase, apiKey, id, true);
  }
}

// ------------------------------------------------------------------ imóvel

async function processarImovel(
  supabase: any,
  cfg: ConfigLimpeza,
  apiKey: string,
  pedido: Pedido,
  imovel: number,
): Promise<{ logId: string; verificar: boolean; outrosImoveis: number[] }> {
  const quem = { event_id: pedido.eventId, evento: pedido.evento, property_id: imovel, reservation_code: pedido.codigo, modo: cfg.modo };
  const { data: criado, error: erroLog } = await supabase
    .from("cleaning_block_log")
    .insert({ origem: pedido.origem, ...quem, status: "processando" })
    .select("id")
    .single();
  if (erroLog) throw new Error(`cleaning_block_log: ${erroLog.message}`);
  const logId = String(criado.id);
  const anotar = async (patch: Record<string, unknown>) => {
    const { error } = await supabase.from("cleaning_block_log").update(patch).eq("id", logId);
    if (error) alertar({ resultado: "erro", ...quem, erro: `cleaning_block_log: ${error.message}` });
  };

  const outros = new Set<number>();
  const esperado: Esperado[] = [];
  let trava: string | null = null;
  try {
    trava = await travar(supabase, imovel);
    const hoje = hojeEm(new Date());

    // Estado atual da reserva, lido já com a trava: dois eventos da mesma
    // reserva (criada e cancelada) nunca decidem com fotos diferentes.
    const estadias = await buscarEstadias(apiKey, pedido.codigo);
    if (estadias.length === 0) throw new Error("a API da Hostex não devolveu a reserva: nada foi alterado");
    for (const s of estadias) if (s.status === "accepted" && s.property_id !== imovel) outros.add(s.property_id);
    for (const l of await linhasAtivas(supabase, { codigo: pedido.codigo })) if (l.property_id !== imovel) outros.add(l.property_id);

    const aceitasAqui = estadias.filter((s) => s.property_id === imovel && s.status === "accepted");
    const referencia = aceitasAqui[0] ?? estadias.find((s) => s.property_id === imovel) ?? estadias[0];
    const cabecalho = {
      reservation_status: referencia.status,
      check_in_date: dataValida(referencia.check_in_date) ? referencia.check_in_date : null,
      check_out_date: dataValida(referencia.check_out_date) ? referencia.check_out_date : null,
    };
    if (aceitasAqui.length > 1) {
      const erro = `a reserva tem ${aceitasAqui.length} estadias aceitas neste imóvel: caso não previsto, nada foi alterado`;
      await anotar({ ...cabecalho, status: "abortado", erro });
      alertar({ resultado: "abortado", ...quem, erro });
      return { logId, verificar: false, outrosImoveis: [...outros] };
    }
    const reserva = aceitasAqui[0] ?? null;

    const registros = await linhasAtivas(supabase, { imovel });
    const desejados = reserva && datasOk(reserva) ? buffersDaReserva(reserva) : [];
    const minhas = registros.filter((l) => l.reservation_code === pedido.codigo);
    const candidatas = [...desejados.map((d) => d.date), ...minhas.map((l) => l.date)].filter((d) => d >= hoje).sort();

    let ativas: ReservaHostex[] = [];
    let disponibilidade: Record<string, boolean> = {};
    let recem: string[] = [];
    if (candidatas.length > 0) {
      // Visão atual do imóvel: toda accepted com check-out de `candidatas[0]` em diante.
      const brutas = await leitura("reservas do imóvel", () =>
        hostexReservasAceitas(apiKey, imovel, candidatas[0], somarDias(candidatas[candidatas.length - 1], 179)));
      ativas = brutas.map(normalizar);
      const aConferir = desejados.map((d) => d.date).filter((d) => d >= hoje && !registros.some((l) => l.date === d)).sort();
      if (aConferir.length > 0) {
        const mapa = await leitura("calendário", () => hostexDisponibilidade(apiKey, imovel, aConferir[0], aConferir[aConferir.length - 1]));
        disponibilidade = Object.fromEntries(mapa);
        recem = await recemLiberadas(supabase, imovel, aConferir);
      }
    }

    const plano = planejarBuffers({ hoje, propertyId: imovel, codigo: pedido.codigo, reserva, ativas, registros, disponibilidade, recemLiberadas: recem });
    const descartadas: Descarte[] = [...plano.descartadas];
    const soRegistro = [
      ...plano.transferir.map((t) => ({ date: t.date, acao: "transferida", para: t.para, kind: t.kind })),
      ...plano.encerrar.map((l) => ({ date: l.date, acao: "encerrada", motivo: l.motivo })),
    ];

    if (plano.abortado) {
      await anotar({ ...cabecalho, status: "abortado", erro: plano.abortado });
      alertar({ resultado: "abortado", ...quem, erro: plano.abortado });
      return { logId, verificar: false, outrosImoveis: [...outros] };
    }

    const haEscrita = plano.bloquear.length + plano.liberar.length > 0;
    if (cfg.modo !== "escrita") {
      const fechadas = plano.bloquear.map((b) => b.date);
      const reabertas = plano.liberar.map((l) => l.date);
      await anotar({
        ...cabecalho,
        status: haEscrita || soRegistro.length > 0 ? "simulado" : "sem_acao",
        bloqueadas: fechadas,
        liberadas: reabertas,
        descartadas,
        so_registro: soRegistro,
      });
      registrar({ resultado: "simulado", ...quem, ...cabecalho, fecharia: fechadas, reabriria: reabertas, descartadas, so_registro: soRegistro });
      return { logId, verificar: false, outrosImoveis: [...outros] };
    }

    // --- registro primeiro: o que só muda no registro
    for (const l of plano.encerrar) {
      const { error } = await supabase
        .from("cleaning_blocks")
        .update({ released_at: agoraIso(), release_reason: l.motivo, release_sent: false, released_event_id: pedido.eventId })
        .eq("id", l.id)
        .is("released_at", null);
      if (error) throw new Error(`cleaning_blocks: ${error.message}`);
    }
    for (const t of plano.transferir) {
      const { error } = await supabase
        .from("cleaning_blocks")
        .update({ reservation_code: t.para, kind: t.kind })
        .eq("id", t.id)
        .is("released_at", null);
      if (error) throw new Error(`cleaning_blocks: ${error.message}`);
    }

    // --- cada data é tomada no registro antes da escrita na Hostex
    const motivoLiberacao = reserva ? "as datas da reserva mudaram" : `reserva ${referencia.status || "sem status"}`;
    for (const l of plano.liberar) {
      const { data, error } = await supabase
        .from("cleaning_blocks")
        .update({ released_at: agoraIso(), release_reason: motivoLiberacao, release_sent: true, released_event_id: pedido.eventId })
        .eq("id", l.id)
        .is("released_at", null)
        .select("id");
      if (error) throw new Error(`cleaning_blocks: ${error.message}`);
      if ((data ?? []).length > 0) esperado.push({ date: l.date, available: true, block_id: l.id });
      else descartadas.push({ date: l.date, kind: l.kind, acao: "liberar", motivo: "já liberada por outro evento" });
    }
    for (const b of plano.bloquear) {
      const { data, error } = await supabase
        .from("cleaning_blocks")
        .insert({ property_id: imovel, date: b.date, reservation_code: pedido.codigo, kind: b.kind, event_id: pedido.eventId })
        .select("id")
        .single();
      if (error) {
        if (error.code !== "23505") throw new Error(`cleaning_blocks: ${error.message}`);
        descartadas.push({ date: b.date, kind: b.kind, acao: "bloquear", motivo: "já fechada por outro evento deste sistema" });
        continue;
      }
      esperado.push({ date: b.date, available: false, block_id: String(data.id) });
    }

    const reabrir = esperado.filter((x) => x.available).map((x) => x.date);
    const fechar = esperado.filter((x) => !x.available).map((x) => x.date);
    if (esperado.length === 0) {
      await anotar({ ...cabecalho, status: soRegistro.length > 0 ? "ok" : "sem_acao", descartadas, so_registro: soRegistro });
      registrar({ resultado: "sem escrita", ...quem, ...cabecalho, descartadas, so_registro: soRegistro });
      return { logId, verificar: false, outrosImoveis: [...outros] };
    }

    // O que se espera fica gravado antes da escrita: se o processo morrer aqui,
    // a verificação de reserva (cron) acha a pendência e confere.
    await anotar({
      ...cabecalho,
      status: "verificando",
      bloqueadas: fechar,
      liberadas: reabrir,
      descartadas,
      so_registro: soRegistro,
      esperado,
      verificar_apos: new Date(Date.now() + ESPERA_VERIFICACAO_MS).toISOString(),
    });

    // --- escrita: lista de datas, exatamente um imóvel por chamada
    const pedidosHostex: string[] = [];
    const falhas: string[] = [];
    for (const [lista, disponivel] of [[reabrir, true], [fechar, false]] as const) {
      if (lista.length === 0) continue;
      try {
        const resp = await hostexMudarDatas(apiKey, imovel, lista, disponivel);
        if (resp?.request_id) pedidosHostex.push(String(resp.request_id));
      } catch (e) {
        falhas.push(`${disponivel ? "reabrir" : "fechar"} ${lista.join(", ")}: ${mensagem(e)}`);
      }
    }
    await anotar({ hostex_request_ids: pedidosHostex, erro: falhas.length > 0 ? falhas.join(" | ") : null });
    registrar({ resultado: "escrito", ...quem, ...cabecalho, fechadas: fechar, reabertas: reabrir, descartadas, so_registro: soRegistro, falhas });
    return { logId, verificar: true, outrosImoveis: [...outros] };
  } catch (e) {
    const erro = mensagem(e);
    alertar({ resultado: "erro", ...quem, erro });
    if (esperado.length > 0) {
      // Já havia data tomada no registro: a verificação decide o que vale.
      await anotar({ status: "verificando", esperado, verificar_apos: agoraIso(), erro });
      return { logId, verificar: true, outrosImoveis: [...outros] };
    }
    await anotar({ status: "erro", erro });
    return { logId, verificar: false, outrosImoveis: [...outros] };
  } finally {
    if (trava) await destravar(supabase, imovel, trava);
  }
}

// ------------------------------------------------------------- verificação

/**
 * Confere no calendário da Hostex o que um evento escreveu.
 *   - tudo como esperado: `ok`;
 *   - divergiu na primeira vez: reenvia cada data UMA vez e marca `reenviado`;
 *   - divergiu depois do reenvio: `erro`, e o registro passa a dizer a verdade
 *     (fechamento não confirmado deixa de valer; reabertura não confirmada
 *     volta a ser linha ativa, para poder ser reprocessada).
 * Uma expectativa que um evento posterior já desfez é ignorada, não reenviada.
 */
export async function verificarLog(supabase: any, apiKey: string, logId: string, esperarSegunda: boolean): Promise<void> {
  const { data: log, error: erroLog } = await supabase.from("cleaning_block_log").select("*").eq("id", logId).maybeSingle();
  if (erroLog || !log) return;
  if (!["processando", "verificando", "reenviado"].includes(log.status)) return;

  const imovel = Number(log.property_id);
  const quem = { event_id: log.event_id, property_id: imovel, reservation_code: log.reservation_code };
  const esperado: Esperado[] = Array.isArray(log.esperado) ? log.esperado : [];
  const tentativas = Number(log.verificacao_tentativas ?? 0);
  const anotar = async (patch: Record<string, unknown>) => {
    const { error } = await supabase.from("cleaning_block_log").update(patch).eq("id", logId);
    if (error) alertar({ resultado: "erro", ...quem, erro: `cleaning_block_log: ${error.message}` });
  };

  if (esperado.length === 0) {
    const erro = "processamento interrompido antes de escrever: reprocesse com select public.limpeza_reprocessar('<código>')";
    await anotar({ status: "erro", erro, verificado_em: agoraIso() });
    alertar({ resultado: "erro", ...quem, erro });
    return;
  }
  if (tentativas >= MAX_TENTATIVAS_VERIFICACAO) {
    const erro = `a verificação não concluiu em ${MAX_TENTATIVAS_VERIFICACAO} tentativas: confira as datas no calendário da Hostex`;
    await anotar({ status: "erro", erro, verificado_em: agoraIso() });
    alertar({ resultado: "erro", ...quem, erro, esperado });
    return;
  }

  let trava: string | null = null;
  let reenviou = false;
  try {
    trava = await travar(supabase, imovel);
    await anotar({ verificacao_tentativas: tentativas + 1 });
    const hoje = hojeEm(new Date());
    const datas = esperado.map((x) => x.date).sort();

    const { data: linhas, error: e1 } = await supabase.from("cleaning_blocks").select("id, date, released_at").in("id", esperado.map((x) => x.block_id));
    if (e1) throw new Error(`cleaning_blocks: ${e1.message}`);
    const { data: ativasNaData, error: e2 } = await supabase
      .from("cleaning_blocks").select("id, date").eq("property_id", imovel).is("released_at", null).in("date", datas);
    if (e2) throw new Error(`cleaning_blocks: ${e2.message}`);
    // Só datas de hoje em diante vão à Hostex (verificação atrasada pode pegar data que já passou).
    const futuras = datas.filter((d) => d >= hoje);
    const mapa = futuras.length > 0
      ? await leitura("calendário", () => hostexDisponibilidade(apiKey, imovel, futuras[0], futuras[futuras.length - 1]))
      : new Map<string, boolean>();

    const notas: Record<string, unknown>[] = [];
    const divergentes: (Esperado & { atual: boolean | null })[] = [];
    for (const x of esperado) {
      const linha = (linhas ?? []).find((l: any) => l.id === x.block_id);
      if (x.date < hoje) {
        notas.push({ date: x.date, nota: "a data já passou: nada a conferir" });
        continue;
      }
      if (!x.available && (!linha || linha.released_at)) {
        notas.push({ date: x.date, nota: "superada: a linha foi liberada por um evento posterior" });
        continue;
      }
      if (x.available && (!linha || !linha.released_at)) {
        notas.push({ date: x.date, nota: "superada: a linha voltou a ficar ativa" });
        continue;
      }
      if (x.available && (ativasNaData ?? []).some((l: any) => l.date === x.date)) {
        notas.push({ date: x.date, nota: "superada: a data foi fechada de novo por este sistema" });
        continue;
      }
      const atual = mapa.has(x.date) ? mapa.get(x.date)! : null;
      if (atual !== x.available) divergentes.push({ ...x, atual });
    }

    if (divergentes.length === 0) {
      await anotar({ status: "ok", verificado_em: agoraIso(), divergencias: notas.length > 0 ? notas : null });
      registrar({ resultado: "verificado", ...quem, datas, notas });
      return;
    }
    const resumo = divergentes.map((d) => ({ date: d.date, esperado: d.available ? "aberta" : "fechada", atual: d.atual === null ? "sem resposta" : d.atual ? "aberta" : "fechada" }));
    alertar({ resultado: "divergência", ...quem, tentativa: tentativas + 1, divergentes: resumo });

    if (log.status === "reenviado") {
      // Já foi reenviado uma vez: para aqui, sem laço.
      for (const d of divergentes) {
        if (!d.available) {
          await supabase
            .from("cleaning_blocks")
            .update({ released_at: agoraIso(), release_reason: "fechamento não confirmado pela Hostex", release_sent: false })
            .eq("id", d.block_id)
            .is("released_at", null);
        } else {
          const { error } = await supabase
            .from("cleaning_blocks")
            .update({ released_at: null, release_reason: null, release_sent: false, released_event_id: null })
            .eq("id", d.block_id);
          if (error) alertar({ resultado: "erro", ...quem, erro: `não consegui reativar a linha de ${d.date}: ${error.message}` });
        }
      }
      const erro = `a Hostex não confirmou depois do reenvio: ${resumo.map((r) => `${r.date} deveria estar ${r.esperado} e está ${r.atual}`).join("; ")}`;
      await anotar({ status: "erro", erro, verificado_em: agoraIso(), divergencias: [...resumo, ...notas] });
      alertar({ resultado: "ERRO_FINAL", ...quem, erro });
      return;
    }

    // Primeira divergência. Antes de reabrir de novo, confere se a data não
    // passou a ser de outra reserva: noite vendida nunca recebe escrita.
    let ativas: ReservaHostex[] = [];
    const reaberturas = divergentes.filter((d) => d.available).map((d) => d.date).sort();
    if (reaberturas.length > 0) {
      const brutas = await leitura("reservas do imóvel", () =>
        hostexReservasAceitas(apiKey, imovel, reaberturas[0], somarDias(reaberturas[reaberturas.length - 1], 179)));
      ativas = brutas.map(normalizar).filter((r) => r.property_id === imovel && r.status === "accepted" && datasOk(r));
    }
    const reenviar: typeof divergentes = [];
    for (const d of divergentes) {
      if (d.available) {
        const vendida = ativas.find((r) => ehNoiteVendida(d.date, r));
        const buffer = vendida ? null : bufferDeOutra(d.date, ativas);
        if (vendida || buffer) {
          notas.push({ date: d.date, nota: `segue fechada: ${vendida ? "noite vendida" : "buffer"} da reserva ${(vendida ?? buffer)!.reservation_code}; sem reenvio` });
          continue;
        }
      }
      reenviar.push(d);
    }
    if (reenviar.length === 0) {
      await anotar({ status: "ok", verificado_em: agoraIso(), divergencias: [...resumo, ...notas] });
      return;
    }
    const falhas: string[] = [];
    for (const d of reenviar) {
      try {
        await hostexMudarDatas(apiKey, imovel, [d.date], d.available);
      } catch (e) {
        falhas.push(`${d.date}: ${mensagem(e)}`);
      }
    }
    await anotar({
      status: "reenviado",
      verificar_apos: new Date(Date.now() + ESPERA_VERIFICACAO_MS).toISOString(),
      divergencias: [...resumo, ...notas],
      erro: falhas.length > 0 ? `reenvio: ${falhas.join(" | ")}` : log.erro ?? null,
    });
    registrar({ resultado: "reenviado", ...quem, datas: reenviar.map((d) => d.date), falhas });
    reenviou = true;
  } catch (e) {
    // Falha de leitura: o status não muda e a verificação de reserva (cron) tenta de novo, até o limite.
    alertar({ resultado: "erro", ...quem, erro: `verificação: ${mensagem(e)}` });
    await anotar({ erro: `verificação: ${mensagem(e)}` });
  } finally {
    if (trava) await destravar(supabase, imovel, trava);
  }

  if (reenviou && esperarSegunda) {
    await dormir(ESPERA_VERIFICACAO_MS);
    await verificarLog(supabase, apiKey, logId, false);
  }
}

/**
 * Rede de segurança do cron (`limpeza-verificacao`): confere o que ficou sem
 * verificação porque o processo do evento morreu antes de terminar.
 */
export async function verificarPendencias(supabase: any): Promise<number> {
  const apiKey = Deno.env.get("HOSTEX_API_KEY");
  if (!apiKey) throw new Error("HOSTEX_API_KEY não configurada");
  const { data, error } = await supabase
    .from("cleaning_block_log")
    .select("id, verificar_apos")
    .in("status", ["processando", "verificando", "reenviado"])
    .lt("created_at", new Date(Date.now() - 2 * 60_000).toISOString())
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) throw new Error(`cleaning_block_log: ${error.message}`);
  let conferidos = 0;
  for (const l of data ?? []) {
    if (l.verificar_apos && new Date(l.verificar_apos).getTime() > Date.now()) continue;
    await verificarLog(supabase, apiKey, String(l.id), false);
    conferidos++;
  }
  registrar({ resultado: "pendências conferidas", conferidos });
  return conferidos;
}
