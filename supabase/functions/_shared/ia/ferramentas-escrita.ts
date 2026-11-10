// Ferramentas de escrita do assistente (Fases 3 e 4 do PLANO_IA_AGENTE.md).
//
// Nenhuma roda sem a pessoa confirmar o cartão na tela: a function grava a
// ação como `aguardando_confirmacao` e só executa `executar` na retomada.
// Toda gravação no portal usa o JWT do usuário (RLS e triggers de autoria
// valem como na tela). Hostex: só equipe, pela API, com a chave do projeto.
import { HOSTEX_BASE, hostexPost } from "../hostexReserva.ts";
import { chaveIdempotente, criarReservaInterna, nomeReservaInterna } from "../reservaInterna.ts";
import {
  type Contexto,
  type FerramentaIA,
  type Papel,
  ErroFerramenta,
  PAPEIS_EQUIPE,
  brl,
  chamarFunction,
  ehUuid,
  exigirAcessoImovel,
  janela,
  somarDias,
  textoCurto,
} from "./politica.ts";

const EQUIPE_E_DONO: Papel[] = [...PAPEIS_EQUIPE, "owner"];
const HOSTEX_ESCRITA: Papel[] = ["admin", "agent"];

type Linha = Record<string, unknown>;

const dataBR = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

async function nomeImovel(ctx: Contexto, propertyId: unknown): Promise<string> {
  if (!ehUuid(propertyId)) return "imóvel geral";
  const { data } = await ctx.userClient.from("properties").select("name").eq("id", propertyId).maybeSingle();
  return (data?.name as string | undefined) ?? "imóvel";
}

// ----------------------------------------------------------------- Hostex

async function idHostexDoImovel(ctx: Contexto, propertyId: string): Promise<number> {
  const { data, error } = await ctx.userClient
    .from("hostex_properties")
    .select("id_hostex, name")
    .eq("property_id", propertyId)
    .limit(2);
  if (error) throw new ErroFerramenta(`Não consegui ler o vínculo com a Hostex: ${error.message}`);
  const linhas = (data ?? []) as Linha[];
  if (linhas.length === 0) throw new ErroFerramenta("Esse imóvel não tem propriedade vinculada na Hostex.");
  if (linhas.length > 1) throw new ErroFerramenta("Esse imóvel tem mais de uma propriedade na Hostex; faça pela Central Hostex.");
  const n = Number(linhas[0].id_hostex);
  if (!Number.isInteger(n)) throw new ErroFerramenta("O id da propriedade na Hostex não é numérico.");
  return n;
}

function janelaHostex(ctx: Contexto, de: unknown, ate: unknown): { de: string; ate: string; noites: number } {
  const j = janela(de, ate);
  if (j.de < ctx.hoje) throw new ErroFerramenta("A Hostex só aceita datas de hoje em diante.");
  if (j.dias > 366) throw new ErroFerramenta("Período maior que um ano; divida em partes.");
  // Na Hostex start_date e end_date são inclusivos (noites): 18 a 24 = 7 noites.
  return { de: j.de, ate: j.ate, noites: j.dias + 1 };
}

/** POST /availabilities: fecha ou reabre noites no calendário mestre (datas inclusivas). */
async function mudarDisponibilidadeHostex(apiKey: string, idHostex: number, de: string, ate: string, disponivel: boolean) {
  return await hostexPost(
    "/availabilities",
    { property_ids: [idHostex], start_date: de, end_date: ate, available: disponivel },
    apiKey,
  );
}

function chaveHostex(_ctx: Contexto): string {
  const apiKey = Deno.env.get("HOSTEX_API_KEY");
  if (!apiKey) throw new ErroFerramenta("A chave da Hostex não está configurada (HOSTEX_API_KEY).");
  return apiKey;
}

async function resumoDatas(ctx: Contexto, entrada: Record<string, unknown>, verbo: string): Promise<string> {
  const nome = await nomeImovel(ctx, entrada.property_id);
  const de = typeof entrada.de === "string" ? dataBR(entrada.de) : "?";
  const ate = typeof entrada.ate === "string" ? dataBR(entrada.ate) : "?";
  return `${verbo} as noites de ${de} a ${ate} (inclusive) do imóvel ${nome} na Hostex. Vale para Airbnb e Booking.`;
}

// Bloqueio da equipe = RESERVA DIRETA "MANUTENÇÃO · <tipo>" na Hostex (desde
// 2026-11-01, pedido do gestor): a equipe de limpeza lê as reservas no app de
// limpeza, e um bloqueio por disponibilidade não aparece lá. O registro fica em
// date_block_requests (reason = maintenance, status = processed), que é de onde
// hostex_liberar_datas e liberar-bloqueio cancelam a reserva depois.
const hostexBloquearDatas: FerramentaIA = {
  nome: "hostex_bloquear_datas",
  descricao:
    "Bloqueia noites de um imóvel para MANUTENÇÃO criando na Hostex uma reserva direta em nome de 'MANUTENÇÃO · <tipo>' (ex.: 'MANUTENÇÃO · Pintura'): fecha a venda no Airbnb, Booking e site, e a equipe de limpeza vê a reserva no app de limpeza com o tipo do serviço, para planejar a limpeza pesada. 'tipo' é obrigatório (Pintura, Elétrica, Hidráulica, Dedetização, Limpeza pesada, Decoração…): se a pessoa não disse, pergunte antes de chamar. Datas inclusivas: 'de' é a primeira noite e 'ate' a última. Antes de pedir, confira a disponibilidade do período e avise se houver reserva aceita dentro dele (a Hostex recusa reserva por cima de outra). O registro fica em /admin/bloqueios-datas como bloqueio de manutenção; para desfazer, hostex_liberar_datas. Só executa depois que a pessoa confirmar o cartão.",
  schema: {
    type: "object" as const,
    properties: {
      property_id: { type: "string", description: "Id do imóvel (uuid do portal)." },
      de: { type: "string", description: "Primeira noite, AAAA-MM-DD (hoje ou depois)." },
      ate: { type: "string", description: "Última noite, AAAA-MM-DD, inclusive. 'De 18 a 24' = de 2026-11-18 até 2026-11-24." },
      tipo: { type: "string", description: "Tipo da manutenção, curto, como vai aparecer para a limpeza: 'Pintura', 'Elétrica', 'Hidráulica', 'Dedetização'…" },
      motivo: { type: "string", description: "Detalhe do serviço, opcional (vai nas observações da reserva)." },
    },
    required: ["property_id", "de", "ate", "tipo"],
    additionalProperties: false as const,
  },
  nivel: "escrita",
  papeis: HOSTEX_ESCRITA,
  imovelParam: "property_id",
  async resumo(entrada, ctx) {
    const nome = await nomeImovel(ctx, entrada.property_id);
    const de = typeof entrada.de === "string" ? dataBR(entrada.de) : "?";
    const ate = typeof entrada.ate === "string" ? dataBR(entrada.ate) : "?";
    const tipo = textoCurto(entrada.tipo, "tipo", 60) ?? "?";
    const motivo = textoCurto(entrada.motivo, "motivo", 80);
    return `Bloquear as noites de ${de} a ${ate} (inclusive) do imóvel ${nome} na Hostex como reserva "${nomeReservaInterna("manutencao", tipo)}"${motivo ? ` — ${motivo}` : ""}. Fecha Airbnb e Booking; a limpeza vê no app.`;
  },
  async executar(ctx, entrada) {
    const imovel = await exigirAcessoImovel(ctx, entrada.property_id);
    const { de, ate, noites } = janelaHostex(ctx, entrada.de, entrada.ate);
    const tipo = textoCurto(entrada.tipo, "tipo", 60);
    if (!tipo || tipo.length < 2) throw new ErroFerramenta("Informe o tipo da manutenção (ex.: Pintura).");
    const motivo = textoCurto(entrada.motivo, "motivo", 400) ?? null;
    const apiKey = chaveHostex(ctx);
    const idHostex = await idHostexDoImovel(ctx, imovel.id);
    const saida = somarDias(ate, 1);
    const { data: prop } = await ctx.userClient.from("properties").select("owner_id").eq("id", imovel.id).maybeSingle();
    const ownerId = (prop as Linha | null)?.owner_id;
    if (!ehUuid(ownerId)) throw new ErroFerramenta("Esse imóvel não tem proprietário cadastrado; registre o bloqueio pela Central Hostex.");

    const id = crypto.randomUUID();
    const agora = new Date().toISOString();
    const guestName = nomeReservaInterna("manutencao", tipo);
    const { error } = await ctx.userClient.from("date_block_requests").insert({
      id,
      property_id: imovel.id,
      owner_id: ownerId,
      start_date: de,
      end_date: saida,
      reason: "maintenance",
      notes: `${tipo}${motivo ? ` — ${motivo}` : ""} (registrado pelo assistente, por ${ctx.nome})`,
      status: "processed",
      processed_at: agora,
      processed_by: ctx.uid,
      criado_por: ctx.uid,
      hostex_guest_name: guestName,
    });
    if (error) throw new ErroFerramenta(`Não consegui registrar o bloqueio: ${error.message}`);

    const remarks = `Manutenção: ${tipo}.${motivo ? ` ${motivo}.` : ""} Registrado pelo assistente do portal RIOS por ${ctx.nome} (pedido ${id}).`;
    const base = { pedido_id: id, imovel: imovel.name, id_hostex: idHostex, de, ate, saida, noites, tipo };
    try {
      const r = await criarReservaInterna({ apiKey, idHostex, checkIn: de, checkOut: saida, tipo: "manutencao", titulo: tipo, remarks, chave: chaveIdempotente(id) });
      await ctx.userClient
        .from("date_block_requests")
        .update({ hostex_reservation_code: r.reservation_code, hostex_request_id: r.request_id, hostex_bloqueado_em: agora, erro_hostex: null })
        .eq("id", id);
      return {
        ...base,
        reserva: r.reservation_code,
        nome_na_hostex: r.guest_name,
        canal: r.custom_channel.name,
        resultado: "reserva de manutenção criada na Hostex",
        aviso: "A Hostex replica ao Airbnb e ao Booking em alguns minutos. A equipe de limpeza vê a reserva no app; o cache do portal mostra na próxima coleta. Para desfazer: hostex_liberar_datas com este pedido_id.",
      };
    } catch (eReserva) {
      // Sem a reserva direta (canal inexistente, conflito…), fecha o calendário
      // como antes e avisa: a limpeza NÃO vê bloqueio por disponibilidade.
      const problema = eReserva instanceof Error ? eReserva.message : String(eReserva);
      const resposta = await mudarDisponibilidadeHostex(apiKey, idHostex, de, ate, false);
      await ctx.userClient
        .from("date_block_requests")
        .update({
          hostex_request_id: resposta?.request_id ?? null,
          hostex_bloqueado_em: agora,
          erro_hostex: `Reserva "${guestName}" não criada (${problema.slice(0, 300)}); datas fechadas por disponibilidade, sem reserva para a limpeza.`,
        })
        .eq("id", id);
      return {
        ...base,
        resultado: "datas fechadas por disponibilidade; a reserva de manutenção NÃO foi criada",
        problema,
        aviso: "A equipe de limpeza não vê bloqueio por disponibilidade no app. Diga o problema à pessoa (em geral falta o canal personalizado 'Manutenção' na Hostex) para ela criar a reserva à mão ou corrigir e tentar de novo.",
      };
    }
  },
};

const hostexLiberarDatas: FerramentaIA = {
  nome: "hostex_liberar_datas",
  descricao:
    "Libera (desbloqueia) noites de um imóvel: cancela na Hostex a reserva de bloqueio ('MANUTENÇÃO · …' da equipe ou 'Proprietário' de um pedido pago) e as noites voltam à venda nos canais em minutos. Informe pedido_id (de bloqueios_de_datas ou reservas_do_imovel) ou as datas 'de' e 'ate' (inclusivas): por datas, libera todos os bloqueios registrados do imóvel que cruzam o período, cada um inteiro. Se não houver bloqueio registrado no período, reabre as noites no calendário mestre por disponibilidade (bloqueios antigos ou feitos à mão na Hostex). Nunca mexe em reserva de hóspede. A taxa paga pelo proprietário não é devolvida sozinha. Só executa depois que a pessoa confirmar o cartão.",
  schema: {
    type: "object" as const,
    properties: {
      property_id: { type: "string", description: "Id do imóvel (uuid do portal)." },
      pedido_id: { type: "string", description: "Id do pedido de bloqueio a liberar (opcional; senão use de/ate)." },
      de: { type: "string", description: "Primeira noite, AAAA-MM-DD (opcional com pedido_id)." },
      ate: { type: "string", description: "Última noite, AAAA-MM-DD, inclusive (opcional com pedido_id)." },
    },
    required: ["property_id"],
    additionalProperties: false as const,
  },
  nivel: "escrita",
  papeis: HOSTEX_ESCRITA,
  imovelParam: "property_id",
  async resumo(entrada, ctx) {
    const nome = await nomeImovel(ctx, entrada.property_id);
    if (ehUuid(entrada.pedido_id)) {
      const { data } = await ctx.userClient
        .from("date_block_requests")
        .select("start_date, end_date, hostex_guest_name")
        .eq("id", entrada.pedido_id)
        .maybeSingle();
      const b = data as Linha | null;
      if (b) {
        return `Liberar na Hostex o bloqueio "${b.hostex_guest_name ?? "—"}" do imóvel ${nome} (entrada ${dataBR(String(b.start_date))}, saída ${dataBR(String(b.end_date))}): a reserva é cancelada e as noites voltam à venda.`;
      }
    }
    return resumoDatas(ctx, entrada, "Liberar");
  },
  async executar(ctx, entrada) {
    const imovel = await exigirAcessoImovel(ctx, entrada.property_id);
    const apiKey = chaveHostex(ctx);
    let pedidos: Linha[] = [];
    let periodo: { de: string; ate: string; noites: number } | null = null;
    if (ehUuid(entrada.pedido_id)) {
      const { data, error } = await ctx.userClient
        .from("date_block_requests")
        .select("id, start_date, end_date, status, hostex_guest_name, hostex_reservation_code")
        .eq("id", entrada.pedido_id)
        .eq("property_id", imovel.id)
        .limit(1);
      if (error) throw new ErroFerramenta(`Não consegui ler o pedido: ${error.message}`);
      pedidos = (data ?? []) as Linha[];
      if (pedidos.length === 0) throw new ErroFerramenta("Pedido de bloqueio não encontrado para esse imóvel.");
      if (pedidos[0].status !== "processed") throw new ErroFerramenta(`Esse pedido está "${pedidos[0].status}"; só bloqueio feito (processed) se libera.`);
    } else {
      const j = janela(entrada.de, entrada.ate);
      periodo = { de: j.de, ate: j.ate, noites: j.dias + 1 };
      const { data, error } = await ctx.userClient
        .from("date_block_requests")
        .select("id, start_date, end_date, status, hostex_guest_name, hostex_reservation_code")
        .eq("property_id", imovel.id)
        .eq("status", "processed")
        .not("hostex_reservation_code", "is", null)
        .lte("start_date", periodo.ate)
        .gt("end_date", periodo.de)
        .order("start_date")
        .limit(20);
      if (error) throw new ErroFerramenta(`Não consegui ler os bloqueios: ${error.message}`);
      pedidos = (data ?? []) as Linha[];
    }

    if (pedidos.length > 0) {
      const liberados: Linha[] = [];
      const falhas: Linha[] = [];
      for (const p of pedidos) {
        const r = await chamarFunction(ctx, "liberar-bloqueio", { id: p.id });
        const dados = (r.dados && typeof r.dados === "object" ? r.dados : {}) as Linha;
        if (r.ok) liberados.push({ pedido_id: p.id, nome_na_hostex: p.hostex_guest_name, reserva: p.hostex_reservation_code, de: p.start_date, saida: p.end_date, resultado: dados.resultado });
        else falhas.push({ pedido_id: p.id, nome_na_hostex: p.hostex_guest_name, erro: dados.error ?? `HTTP ${r.status}` });
      }
      if (liberados.length === 0) throw new ErroFerramenta(String(falhas[0]?.erro ?? "Não consegui liberar."));
      return {
        imovel: imovel.name,
        liberados,
        ...(falhas.length ? { falhas } : {}),
        aviso: "As reservas de bloqueio foram canceladas na Hostex; as noites voltam ao Airbnb e ao Booking em alguns minutos.",
      };
    }

    // Nada registrado no período: bloqueio antigo ou feito à mão → reabre por disponibilidade.
    if (!periodo) throw new ErroFerramenta("Informe de/ate para liberar por datas.");
    const de = periodo.de < ctx.hoje ? ctx.hoje : periodo.de;
    if (periodo.ate < ctx.hoje) throw new ErroFerramenta("O período já passou; não há noites para liberar.");
    const idHostex = await idHostexDoImovel(ctx, imovel.id);
    const resposta = await mudarDisponibilidadeHostex(apiKey, idHostex, de, periodo.ate, true);
    return {
      imovel: imovel.name,
      id_hostex: idHostex,
      de,
      ate: periodo.ate,
      resultado: "datas reabertas no calendário mestre (não havia bloqueio registrado no portal nesse período)",
      hostex: resposta?.data ?? resposta ?? null,
      aviso: "Se o período estava fechado por uma reserva direta feita à mão na Hostex, ela continua: cancele pela Central Hostex. A Hostex replica aos canais em alguns minutos.",
      endpoint: `${HOSTEX_BASE}/availabilities`,
    };
  },
};

// --------------------------------------------------------------- chamados

const TIPOS_TICKET = [
  "duvida", "manutencao", "cobranca", "bloqueio_data", "financeiro", "outros", "informacao", "conversar_hospedes", "melhorias_compras",
];
const TIPOS_PROPRIETARIO = ["duvida", "financeiro", "outros", "informacao", "conversar_hospedes", "melhorias_compras"];
const STATUS_TICKET = ["novo", "em_analise", "aguardando_info", "em_execucao", "concluido", "cancelado"];

const abrirChamado: FerramentaIA = {
  nome: "abrir_chamado",
  descricao:
    "Abre um chamado (ticket) ligado a um imóvel. Equipe: o chamado vai para o proprietário do imóvel, que recebe e-mail, e aparece em /todos-tickets. Proprietário: abre um pedido à RIOS sobre o próprio imóvel (tipos: duvida, informacao, financeiro, conversar_hospedes, melhorias_compras, outros). Para manutenção da equipe, prefira a lista de manutenções. Só executa depois da confirmação.",
  schema: {
    type: "object",
    properties: {
      property_id: { type: "string", description: "Id do imóvel." },
      tipo: { type: "string", description: `Tipo: ${TIPOS_TICKET.join(", ")}.` },
      titulo: { type: "string", description: "Assunto curto (até 120 caracteres)." },
      descricao: { type: "string", description: "Descrição completa, em pt-BR." },
      prioridade: { type: "string", description: "'normal' (padrão) ou 'urgente'." },
    },
    required: ["property_id", "tipo", "titulo", "descricao"],
    additionalProperties: false,
  },
  nivel: "escrita",
  papeis: EQUIPE_E_DONO,
  imovelParam: "property_id",
  async resumo(entrada, ctx) {
    const nome = await nomeImovel(ctx, entrada.property_id);
    return `Abrir chamado "${textoCurto(entrada.titulo, "titulo", 120) ?? "?"}" (${entrada.tipo ?? "?"}) no imóvel ${nome}${
      ctx.equipe ? ", avisando o proprietário por e-mail" : ""
    }.`;
  },
  async executar(ctx, entrada) {
    const imovel = await exigirAcessoImovel(ctx, entrada.property_id);
    const tipo = textoCurto(entrada.tipo, "tipo", 30) ?? "";
    const permitidos = ctx.equipe ? TIPOS_TICKET : TIPOS_PROPRIETARIO;
    if (!permitidos.includes(tipo)) throw new ErroFerramenta(`Tipo inválido. Use um destes: ${permitidos.join(", ")}.`);
    const titulo = textoCurto(entrada.titulo, "titulo", 120);
    const descricao = textoCurto(entrada.descricao, "descricao", 4000);
    if (!titulo || titulo.length < 3) throw new ErroFerramenta("Informe um assunto com ao menos 3 caracteres.");
    if (!descricao || descricao.length < 5) throw new ErroFerramenta("Informe uma descrição.");
    const prioridade = entrada.prioridade === "urgente" ? "urgente" : "normal";

    let ownerId = ctx.uid;
    if (ctx.equipe) {
      const { data } = await ctx.userClient.from("properties").select("owner_id").eq("id", imovel.id).maybeSingle();
      if (!data?.owner_id) throw new ErroFerramenta("Esse imóvel não tem proprietário cadastrado.");
      ownerId = data.owner_id as string;
    }
    const { data: ticket, error } = await ctx.userClient
      .from("tickets")
      .insert({
        owner_id: ownerId,
        created_by: ctx.uid,
        ticket_type: tipo,
        subject: titulo,
        description: descricao,
        priority: prioridade,
        property_id: imovel.id,
      })
      .select("id")
      .single();
    if (error || !ticket) throw new ErroFerramenta(`Não consegui abrir o chamado: ${error?.message ?? "sem id"}`);

    let aviso = "sem e-mail";
    if (ctx.equipe) {
      const r = await chamarFunction(ctx, "notify-ticket", { type: "ticket_created", ticketId: ticket.id });
      aviso = r.ok ? "proprietário avisado por e-mail" : `e-mail não enviado (HTTP ${r.status})`;
    }
    return { id: ticket.id, imovel: imovel.name, tipo, titulo, prioridade, aviso, link: `/ticket-detalhes/${ticket.id}` };
  },
};

const responderChamado: FerramentaIA = {
  nome: "responder_chamado",
  descricao:
    "Escreve uma mensagem na conversa de um chamado, pelo mesmo caminho da tela (quem precisa é avisado). Equipe pode marcar `interna` para nota que o proprietário não vê. Só executa depois da confirmação. Use detalhe_chamado antes para saber o contexto.",
  schema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Id do chamado (uuid)." },
      mensagem: { type: "string", description: "Texto da mensagem, em pt-BR, já pronto para enviar." },
      interna: { type: "boolean", description: "true = nota interna da equipe (padrão false)." },
    },
    required: ["id", "mensagem"],
    additionalProperties: false,
  },
  nivel: "escrita",
  papeis: EQUIPE_E_DONO,
  async resumo(entrada, ctx) {
    let assunto = "?";
    if (ehUuid(entrada.id)) {
      const { data } = await ctx.userClient.from("tickets").select("subject").eq("id", entrada.id).maybeSingle();
      assunto = (data?.subject as string | undefined) ?? "?";
    }
    const interna = ctx.equipe && entrada.interna === true;
    return `${interna ? "Nota interna" : "Responder"} no chamado "${assunto}": "${textoCurto(entrada.mensagem, "mensagem", 160) ?? ""}"`;
  },
  async executar(ctx, entrada) {
    if (!ehUuid(entrada.id)) throw new ErroFerramenta("Informe o id do chamado (uuid).");
    const mensagem = textoCurto(entrada.mensagem, "mensagem", 4000);
    if (!mensagem) throw new ErroFerramenta("A mensagem está vazia.");
    const interna = ctx.equipe && entrada.interna === true;
    const r = await chamarFunction(ctx, "create-ticket-message", { message: mensagem, is_internal: interna }, `/${entrada.id}`);
    if (!r.ok) {
      const erro = (r.dados as { error?: string } | null)?.error ?? `HTTP ${r.status}`;
      throw new ErroFerramenta(`A mensagem não foi gravada: ${erro}`);
    }
    return { ok: true, chamado_id: entrada.id, interna, link: `/ticket-detalhes/${entrada.id}` };
  },
};

const mudarStatusChamado: FerramentaIA = {
  nome: "mudar_status_chamado",
  descricao:
    "Muda o status de um chamado (novo, em_analise, aguardando_info, em_execucao, concluido, cancelado). Só equipe; só executa depois da confirmação. Não use em manutenção que precisa ser enviada ao proprietário (isso é na lista de manutenções).",
  schema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Id do chamado (uuid)." },
      status: { type: "string", description: `Novo status: ${STATUS_TICKET.join(", ")}.` },
    },
    required: ["id", "status"],
    additionalProperties: false,
  },
  nivel: "escrita",
  papeis: PAPEIS_EQUIPE,
  async resumo(entrada, ctx) {
    let assunto = "?";
    if (ehUuid(entrada.id)) {
      const { data } = await ctx.userClient.from("tickets").select("subject, status").eq("id", entrada.id).maybeSingle();
      assunto = data ? `${data.subject} (hoje: ${data.status})` : "?";
    }
    return `Mudar o status do chamado "${assunto}" para ${entrada.status ?? "?"}.`;
  },
  async executar(ctx, entrada) {
    if (!ehUuid(entrada.id)) throw new ErroFerramenta("Informe o id do chamado (uuid).");
    const status = textoCurto(entrada.status, "status", 30) ?? "";
    if (!STATUS_TICKET.includes(status)) throw new ErroFerramenta(`Status inválido. Use: ${STATUS_TICKET.join(", ")}.`);
    const { data, error } = await ctx.userClient
      .from("tickets")
      .update({ status })
      .eq("id", entrada.id)
      .select("id, subject, status")
      .maybeSingle();
    if (error) throw new ErroFerramenta(`Não consegui mudar o status: ${error.message}`);
    if (!data) throw new ErroFerramenta("Chamado não encontrado ou sem permissão.");
    return { id: data.id, assunto: data.subject, status: data.status, link: `/ticket-detalhes/${data.id}` };
  },
};

// ------------------------------------------------------------------ listas

const CATEGORIAS_AJUSTE = ["anuncio", "ficha", "mensagens", "roupa_de_cama", "sistema", "outro"];

async function imovelOuGeral(ctx: Contexto, propertyId: unknown): Promise<{ id: string | null; nome: string }> {
  if (propertyId === undefined || propertyId === null || propertyId === "" || propertyId === "geral") {
    return { id: null, nome: "Geral" };
  }
  const imovel = await exigirAcessoImovel(ctx, propertyId);
  return { id: imovel.id, nome: imovel.name };
}

const registrarAjuste: FerramentaIA = {
  nome: "registrar_ajuste",
  descricao:
    "Registra um aviso de ajuste na lista /ajustes (erro em anúncio, ficha, mensagens automáticas, roupa de cama, sistema ou outro) para a equipe resolver; o gestor recebe WhatsApp. Imóvel opcional (sem imóvel = geral). Só executa depois da confirmação.",
  schema: {
    type: "object",
    properties: {
      property_id: { type: "string", description: "Id do imóvel, ou omita para 'geral'." },
      categoria: { type: "string", description: `Uma de: ${CATEGORIAS_AJUSTE.join(", ")}.` },
      descricao: { type: "string", description: "O que está errado e onde (3 a 2000 caracteres)." },
      urgente: { type: "boolean", description: "true se precisa de atenção imediata (padrão false)." },
    },
    required: ["categoria", "descricao"],
    additionalProperties: false,
  },
  nivel: "escrita",
  papeis: PAPEIS_EQUIPE,
  imovelParam: "property_id",
  async resumo(entrada, ctx) {
    const nome = await nomeImovel(ctx, entrada.property_id);
    return `Registrar ajuste (${entrada.categoria ?? "?"}${entrada.urgente === true ? ", urgente" : ""}) em ${nome}: "${textoCurto(entrada.descricao, "descricao", 140) ?? ""}". Avisa o gestor por WhatsApp.`;
  },
  async executar(ctx, entrada) {
    const alvo = await imovelOuGeral(ctx, entrada.property_id);
    const categoria = textoCurto(entrada.categoria, "categoria", 30) ?? "";
    if (!CATEGORIAS_AJUSTE.includes(categoria)) throw new ErroFerramenta(`Categoria inválida. Use: ${CATEGORIAS_AJUSTE.join(", ")}.`);
    const descricao = textoCurto(entrada.descricao, "descricao", 2000);
    if (!descricao || descricao.length < 3) throw new ErroFerramenta("Descreva o ajuste.");
    const id = crypto.randomUUID();
    const { error } = await ctx.userClient.from("ajustes").insert({
      id,
      property_id: alvo.id,
      categoria,
      descricao,
      urgente: entrada.urgente === true,
      fotos: [],
    });
    if (error) throw new ErroFerramenta(`Não consegui registrar o ajuste: ${error.message}`);
    return { id, imovel: alvo.nome, categoria, urgente: entrada.urgente === true, link: "/ajustes" };
  },
};

const registrarCompra: FerramentaIA = {
  nome: "registrar_compra",
  descricao:
    "Adiciona um pedido à lista de compras (/compras): item, quantidade, imóvel (ou geral/estoque), canal ('rua' = comprar na rua, 'online' = com link) e quem paga ('owner' proprietário, 'pm' gestão, 'guest' hóspede). Quem compra recebe WhatsApp. Só executa depois da confirmação.",
  schema: {
    type: "object",
    properties: {
      property_id: { type: "string", description: "Id do imóvel, ou omita para geral/estoque." },
      item: { type: "string", description: "O que comprar (2 a 200 caracteres)." },
      quantidade: { type: "integer", description: "Quantidade (1 a 999; padrão 1)." },
      link: { type: "string", description: "Link do produto (http/https), opcional; se vier, canal = online." },
      canal: { type: "string", description: "'rua' (padrão) ou 'online'." },
      custo: { type: "string", description: "'owner', 'pm' ou 'guest'. Padrão: owner se tem imóvel, pm se geral." },
    },
    required: ["item"],
    additionalProperties: false,
  },
  nivel: "escrita",
  papeis: PAPEIS_EQUIPE,
  imovelParam: "property_id",
  async resumo(entrada, ctx) {
    const nome = await nomeImovel(ctx, entrada.property_id);
    const q = typeof entrada.quantidade === "number" ? entrada.quantidade : 1;
    return `Pôr na lista de compras: ${q}× "${textoCurto(entrada.item, "item", 100) ?? ""}" para ${nome}${entrada.link ? " (online)" : ""}. Avisa quem compra por WhatsApp.`;
  },
  async executar(ctx, entrada) {
    const alvo = await imovelOuGeral(ctx, entrada.property_id);
    const item = textoCurto(entrada.item, "item", 200);
    if (!item || item.length < 2) throw new ErroFerramenta("Informe o item.");
    const quantidade = typeof entrada.quantidade === "number" && Number.isFinite(entrada.quantidade)
      ? Math.min(Math.max(Math.floor(entrada.quantidade), 1), 999)
      : 1;
    const link = textoCurto(entrada.link, "link", 500) ?? null;
    if (link && !/^https?:\/\//i.test(link)) throw new ErroFerramenta("O link precisa começar com http:// ou https://.");
    const canal = link || entrada.canal === "online" ? "online" : "rua";
    const custo = ["owner", "pm", "guest"].includes(String(entrada.custo)) ? String(entrada.custo) : alvo.id ? "owner" : "pm";
    const id = crypto.randomUUID();
    const { error } = await ctx.userClient.from("compras").insert({
      id,
      property_id: alvo.id,
      item,
      quantidade,
      link,
      canal,
      custo,
      anexos: [],
    });
    if (error) throw new ErroFerramenta(`Não consegui registrar a compra: ${error.message}`);
    return { id, imovel: alvo.nome, item, quantidade, canal, custo, link: "/compras" };
  },
};

const registrarTarefaRua: FerramentaIA = {
  nome: "registrar_tarefa_rua",
  descricao:
    "Cria uma tarefa de rua (/tarefas-rua): algo que a equipe de rua precisa ir fazer num imóvel (ou geral). Quem vai cuidar recebe WhatsApp com o estado do imóvel; sem responsável, vai para o padrão (Kaique). Só executa depois da confirmação.",
  schema: {
    type: "object",
    properties: {
      property_id: { type: "string", description: "Id do imóvel, ou omita para geral." },
      descricao: { type: "string", description: "O que fazer, claro e curto (3 a 2000 caracteres)." },
      responsavel_id: { type: "string", description: "Id do perfil de quem vai cuidar (opcional; use buscar_proprietario não serve aqui, pergunte o nome e deixe em branco se não souber)." },
    },
    required: ["descricao"],
    additionalProperties: false,
  },
  nivel: "escrita",
  papeis: PAPEIS_EQUIPE,
  imovelParam: "property_id",
  async resumo(entrada, ctx) {
    const nome = await nomeImovel(ctx, entrada.property_id);
    return `Criar tarefa de rua em ${nome}: "${textoCurto(entrada.descricao, "descricao", 140) ?? ""}". Avisa o responsável por WhatsApp.`;
  },
  async executar(ctx, entrada) {
    const alvo = await imovelOuGeral(ctx, entrada.property_id);
    const descricao = textoCurto(entrada.descricao, "descricao", 2000);
    if (!descricao || descricao.length < 3) throw new ErroFerramenta("Descreva a tarefa.");
    const id = crypto.randomUUID();
    const linha: Record<string, unknown> = { id, property_id: alvo.id, descricao, anexos: [] };
    if (ehUuid(entrada.responsavel_id)) linha.responsavel_id = entrada.responsavel_id;
    const { error } = await ctx.userClient.from("tarefas_rua").insert(linha);
    if (error) throw new ErroFerramenta(`Não consegui criar a tarefa: ${error.message}`);
    return { id, imovel: alvo.nome, descricao, link: "/tarefas-rua" };
  },
};

// ----------------------------------------------- bloqueio do proprietário
// Fluxo de CLAUDE.md §3.21: o proprietário não bloqueia direto. São três modos
// de limpeza (create-bloqueio-pix, campo `limpeza`):
//   pix            paga a taxa de limpeza por PIX; o webhook bloqueia na Hostex
//                  quando o pagamento entra;
//   entrega_limpo  (desde 2026-11-10) não paga agora: a RIOS limpa antes, ele
//                  devolve limpo e paga a taxa se a RIOS julgar o imóvel
//                  inadequado;
//   sem_limpeza    (desde 2026-11-10) não paga: recebe o imóvel sem limpeza
//                  antes da entrada; limpeza só na saída.
// Nos dois sem PIX a reserva nasce na hora, cada um no seu canal da Hostex.
// Liberar passa por liberar-bloqueio.

type ModoLimpeza = "pix" | "entrega_limpo" | "sem_limpeza";
const modoLimpeza = (v: unknown): ModoLimpeza => {
  if (v === undefined || v === null || v === "" || v === "pix") return "pix";
  if (v === "entrega_limpo" || v === "sem_limpeza") return v;
  throw new ErroFerramenta("Opção de limpeza inválida: use pix, entrega_limpo ou sem_limpeza.");
};

const pedirBloqueioDeDatas: FerramentaIA = {
  nome: "pedir_bloqueio_de_datas",
  descricao:
    "Pede o bloqueio de datas de um imóvel para uso pessoal do proprietário, pelo mesmo caminho do botão 'Bloqueio' do painel. Há três opções de limpeza (`limpeza`) e quem escolhe é o proprietário: se ele não disse qual quer, apresente as três e pergunte antes de chamar. 'pix' (padrão): gera um PIX no valor da taxa de limpeza do imóvel e, quando o pagamento entra, as noites são bloqueadas na Hostex sozinhas (Airbnb e Booking), como reserva direta em nome de 'Proprietário'; o cartão na tela mostra o QR Code e o botão de copiar o código: na resposta diga só o valor, o prazo de 30 minutos e que o QR está no cartão; não repita o código. 'entrega_limpo': ele não paga a taxa agora; a RIOS limpa o imóvel antes da entrada dele e ele se compromete a devolver o imóvel limpo, pronto para os próximos hóspedes; se a RIOS avaliar que o imóvel não voltou adequado, ele paga a taxa de limpeza (a equipe lança a cobrança depois); sem PIX, as noites são bloqueadas na hora, como reserva direta no canal 'PROPRIETÁRIO - PEDIU PRA LIMPAR E DISSE QUE IA ENTREGAR LIMPO(NÃO PAGOU TAXA)'. 'sem_limpeza': ele não paga a taxa e concorda em receber o imóvel no estado em que estiver, sem limpeza antes da chegada dele (pode ter acabado de sair um hóspede); a limpeza é feita só depois da saída dele; nada é cobrado e não há PIX: as noites são bloqueadas na hora, como reserva direta no canal 'PROPRIETÁRIO - NÃO PEDIU LIMPEZA/LIMPAR NA SAÍDA'. O canal avisa a equipe de limpeza do que foi combinado. Só use 'entrega_limpo' ou 'sem_limpeza' quando a pessoa disser com clareza que aceita as condições daquela opção; confirmar o cartão é o aceite dela. Nas três: `entrada` é o dia de chegada e `saida` o dia de saída (a última noite é a véspera); de hoje em diante, 1 a 30 noites, e as noites precisam estar livres (a function confere reservas, outros pedidos e o calendário ao vivo da Hostex). Antes de pedir, confira disponibilidade e repita entrada e saída para a pessoa. Só executa depois da confirmação. Não existe bloqueio por manutenção pelo proprietário: obra ou reparo é com a RIOS (abrir_chamado).",
  schema: {
    type: "object",
    properties: {
      property_id: { type: "string", description: "Id do imóvel." },
      entrada: { type: "string", description: "Dia de chegada, AAAA-MM-DD (hoje ou depois)." },
      saida: { type: "string", description: "Dia de saída, AAAA-MM-DD (a última noite bloqueada é a véspera)." },
      observacao: { type: "string", description: "Observação curta para a equipe (opcional)." },
      limpeza: {
        type: "string",
        enum: ["pix", "entrega_limpo", "sem_limpeza"],
        description:
          "Opção de limpeza escolhida pelo proprietário. 'pix' (padrão) = paga a taxa de limpeza por PIX. 'entrega_limpo' = não paga agora: a RIOS limpa antes da entrada, ele devolve o imóvel limpo e paga a taxa se a RIOS julgar o imóvel inadequado. 'sem_limpeza' = não paga e recebe o imóvel sem limpeza antes da entrada; limpeza só na saída. As duas últimas bloqueiam na hora, sem PIX.",
      },
    },
    required: ["property_id", "entrada", "saida"],
    additionalProperties: false,
  },
  nivel: "escrita",
  papeis: EQUIPE_E_DONO,
  imovelParam: "property_id",
  async resumo(entrada, ctx) {
    let nome = "imóvel";
    let taxa = "";
    if (ehUuid(entrada.property_id)) {
      const { data } = await ctx.userClient
        .from("properties")
        .select("name, taxa_limpeza_cents")
        .eq("id", entrada.property_id)
        .maybeSingle();
      nome = (data?.name as string | undefined) ?? nome;
      const cents = data?.taxa_limpeza_cents as number | null | undefined;
      taxa = typeof cents === "number" && cents > 0 ? ` de ${brl(cents)}` : "";
    }
    const de = typeof entrada.entrada === "string" ? dataBR(entrada.entrada) : "?";
    const ate = typeof entrada.saida === "string" ? dataBR(entrada.saida) : "?";
    if (entrada.limpeza === "sem_limpeza") {
      return `Bloquear o imóvel ${nome} para uso pessoal, entrada ${de} e saída ${ate}, SEM limpeza antes da entrada. Ao confirmar, você concorda em receber o imóvel no estado em que estiver, sem limpeza antes da sua chegada; a limpeza é feita só depois da sua saída. Não há taxa nem PIX, e as datas são bloqueadas na hora.`;
    }
    if (entrada.limpeza === "entrega_limpo") {
      return `Bloquear o imóvel ${nome} para uso pessoal, entrada ${de} e saída ${ate}, com a RIOS limpando antes da entrada e sem taxa agora. Ao confirmar, você se compromete a devolver o imóvel limpo, pronto para os próximos hóspedes, e a pagar a taxa de limpeza${taxa} se a RIOS avaliar que ele não ficou adequado. Não há PIX, e as datas são bloqueadas na hora.`;
    }
    return `Pedir bloqueio para uso pessoal do imóvel ${nome}, entrada ${de} e saída ${ate}. Gera um PIX da taxa de limpeza${taxa}; as datas só são bloqueadas depois do pagamento.`;
  },
  async executar(ctx, entrada) {
    const imovel = await exigirAcessoImovel(ctx, entrada.property_id);
    const j = janela(entrada.entrada, entrada.saida);
    if (j.de < ctx.hoje) throw new ErroFerramenta("A entrada precisa ser hoje ou depois.");
    if (j.dias < 1) throw new ErroFerramenta("A saída precisa ser depois da entrada.");
    if (j.dias > 30) throw new ErroFerramenta("No máximo 30 noites por pedido.");
    const modo = modoLimpeza(entrada.limpeza);
    const r = await chamarFunction(ctx, "create-bloqueio-pix", {
      property_id: imovel.id,
      start_date: j.de,
      end_date: j.ate,
      notes: textoCurto(entrada.observacao, "observacao", 500) ?? null,
      ...(modo !== "pix" ? { limpeza: modo } : {}),
    });
    const dados = (r.dados && typeof r.dados === "object" ? r.dados : {}) as Record<string, unknown>;
    if (!r.ok) throw new ErroFerramenta(String(dados.error ?? `Não consegui gerar o pedido (HTTP ${r.status}).`));
    if (modo !== "pix") {
      // Versão antiga da function no ar ignora `limpeza` e gera um PIX:
      // retira o pedido e avisa, em vez de cobrar quem escolheu não pagar.
      if (dados.limpeza !== modo) {
        if (ehUuid(dados.id)) await chamarFunction(ctx, "liberar-bloqueio", { id: dados.id });
        throw new ErroFerramenta("Essa opção de bloqueio sem PIX ainda não está disponível no portal. Nada foi bloqueado nem cobrado; tente de novo mais tarde ou fale com a equipe.");
      }
      const bloqueado = dados.status === "processed";
      const compromisso = typeof dados.taxa_compromisso_cents === "number" ? brl(dados.taxa_compromisso_cents) : null;
      return {
        pedido_id: dados.id,
        imovel: imovel.name,
        entrada: j.de,
        saida: j.ate,
        noites: dados.noites ?? j.dias,
        limpeza: modo,
        combinado:
          modo === "sem_limpeza"
            ? "sem limpeza antes da entrada (o proprietário aceitou receber o imóvel como estiver); limpeza só na saída"
            : `a RIOS limpa antes da entrada; o proprietário devolve o imóvel limpo para os próximos hóspedes e paga a taxa de limpeza${compromisso ? ` (${compromisso})` : ""} se a RIOS julgar o imóvel inadequado`,
        cobrado_agora: "nada (sem PIX)",
        status: bloqueado ? "bloqueado" : "pedido registrado; a equipe RIOS conclui o bloqueio no calendário",
        ...(ctx.equipe ? { na_hostex: dados.nome_na_hostex ?? null, canal: dados.canal ?? null, reserva: dados.reserva ?? null, canal_generico: dados.canal_generico ?? false } : {}),
        instrucao: bloqueado
          ? `As noites já estão fechadas no Airbnb e no Booking (a Hostex replica em minutos). Diga que não há nada a pagar agora e relembre o combinado em uma frase${modo === "entrega_limpo" ? " (devolver limpo; a taxa só é cobrada se a RIOS avaliar que não ficou adequado)" : " (o imóvel não é limpo antes da entrada)"}. Para desfazer: liberar_bloqueio_de_datas.`
          : "A Hostex não aceitou o bloqueio automático; o pedido ficou na fila da equipe RIOS, que conclui. Diga isso sem prometer horário.",
      };
    }
    return {
      pedido_id: dados.id,
      imovel: imovel.name,
      entrada: j.de,
      saida: j.ate,
      noites: dados.noites ?? j.dias,
      limpeza: "pix",
      taxa_de_limpeza: brl(dados.valor_cents as number | null),
      pix_expira_em: dados.pix_expira_em,
      pix_copia_e_cola: dados.pix_qr_code,
      instrucao:
        "O QR Code e o botão de copiar estão no cartão da ação, na tela. Depois do pagamento o portal bloqueia as datas na Hostex sozinho e a tela acompanha.",
    };
  },
};

const liberarBloqueioDeDatas: FerramentaIA = {
  nome: "liberar_bloqueio_de_datas",
  descricao:
    "Libera um bloqueio de datas que o proprietário pediu (status 'bloqueado'): cancela na Hostex a reserva 'Proprietário' daquele pedido (bloqueios antigos: reabre as noites por disponibilidade), e as noites voltam à venda no Airbnb e no Booking em minutos. Também retira um pedido ainda pendente ou aguardando PIX (vira cancelado; nada tinha sido bloqueado). Bloqueio de manutenção da equipe o proprietário não libera (403): oriente a falar com a RIOS. Use bloqueios_de_datas antes para achar o pedido_id e confirme com a pessoa qual bloqueio é. A taxa de limpeza paga não é devolvida automaticamente. Só executa depois da confirmação.",
  schema: {
    type: "object",
    properties: {
      pedido_id: { type: "string", description: "Id do pedido de bloqueio (de bloqueios_de_datas ou reservas_do_imovel)." },
    },
    required: ["pedido_id"],
    additionalProperties: false,
  },
  nivel: "escrita",
  papeis: EQUIPE_E_DONO,
  async resumo(entrada, ctx) {
    if (!ehUuid(entrada.pedido_id)) return "Liberar bloqueio de datas.";
    const { data } = await ctx.userClient
      .from("date_block_requests")
      .select("start_date, end_date, status, pago_em, property:properties(name)")
      .eq("id", entrada.pedido_id)
      .maybeSingle();
    if (!data) return "Liberar bloqueio de datas (pedido não encontrado).";
    const nome = ((Array.isArray(data.property) ? data.property[0] : data.property) as { name?: string } | null)?.name ?? "imóvel";
    const periodo = `entrada ${dataBR(String(data.start_date))} e saída ${dataBR(String(data.end_date))}`;
    if (data.status !== "processed") return `Retirar o pedido de bloqueio do imóvel ${nome} (${periodo}), que ainda não foi processado.`;
    return `Liberar na Hostex o bloqueio do imóvel ${nome} (${periodo}): as noites voltam à venda.${
      data.pago_em ? " A taxa de limpeza paga não é devolvida automaticamente." : ""
    }`;
  },
  async executar(ctx, entrada) {
    if (!ehUuid(entrada.pedido_id)) throw new ErroFerramenta("Informe o id do pedido de bloqueio.");
    const r = await chamarFunction(ctx, "liberar-bloqueio", { id: entrada.pedido_id });
    const dados = (r.dados && typeof r.dados === "object" ? r.dados : {}) as Record<string, unknown>;
    if (!r.ok) throw new ErroFerramenta(String(dados.error ?? `Não consegui liberar (HTTP ${r.status}).`));
    return dados;
  },
};

export const CATALOGO_ESCRITA: FerramentaIA[] = [
  hostexBloquearDatas,
  hostexLiberarDatas,
  pedirBloqueioDeDatas,
  liberarBloqueioDeDatas,
  abrirChamado,
  responderChamado,
  mudarStatusChamado,
  registrarAjuste,
  registrarCompra,
  registrarTarefaRua,
];
