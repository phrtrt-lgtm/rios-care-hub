// Ferramentas de escrita do assistente (Fases 3 e 4 do PLANO_IA_AGENTE.md).
//
// Nenhuma roda sem a pessoa confirmar o cartão na tela: a function grava a
// ação como `aguardando_confirmacao` e só executa `executar` na retomada.
// Toda gravação no portal usa o JWT do usuário (RLS e triggers de autoria
// valem como na tela). Hostex: só equipe, pela API, com a chave do projeto.
import { HOSTEX_BASE, hostexPost } from "../hostexReserva.ts";
import {
  type Contexto,
  type FerramentaIA,
  type Papel,
  ErroFerramenta,
  PAPEIS_EQUIPE,
  chamarFunction,
  ehUuid,
  exigirAcessoImovel,
  janela,
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

async function mudarDisponibilidade(ctx: Contexto, entrada: Record<string, unknown>, disponivel: boolean) {
  const imovel = await exigirAcessoImovel(ctx, entrada.property_id);
  const { de, ate, noites } = janelaHostex(ctx, entrada.de, entrada.ate);
  const apiKey = Deno.env.get("HOSTEX_API_KEY");
  if (!apiKey) throw new ErroFerramenta("A chave da Hostex não está configurada (HOSTEX_API_KEY).");
  const idHostex = await idHostexDoImovel(ctx, imovel.id);
  const resposta = await hostexPost(
    "/availabilities",
    { property_ids: [idHostex], start_date: de, end_date: ate, available: disponivel },
    apiKey,
  );
  return {
    imovel: imovel.name,
    id_hostex: idHostex,
    de,
    ate,
    noites,
    resultado: disponivel ? "datas liberadas" : "datas bloqueadas",
    hostex: resposta?.data ?? resposta ?? null,
    aviso: "A Hostex aplica em segundo plano e replica ao Airbnb e ao Booking em alguns minutos. O cache do portal não mostra bloqueios.",
    endpoint: `${HOSTEX_BASE}/availabilities`,
  };
}

const schemaDatasHostex = {
  type: "object" as const,
  properties: {
    property_id: { type: "string", description: "Id do imóvel (uuid do portal)." },
    de: { type: "string", description: "Primeira noite, AAAA-MM-DD (hoje ou depois)." },
    ate: { type: "string", description: "Última noite, AAAA-MM-DD, inclusive. 'De 18 a 24' = de 2026-11-18 até 2026-11-24." },
    motivo: { type: "string", description: "Motivo curto, só para o registro (opcional)." },
  },
  required: ["property_id", "de", "ate"],
  additionalProperties: false as const,
};

async function resumoDatas(ctx: Contexto, entrada: Record<string, unknown>, verbo: string): Promise<string> {
  const nome = await nomeImovel(ctx, entrada.property_id);
  const de = typeof entrada.de === "string" ? dataBR(entrada.de) : "?";
  const ate = typeof entrada.ate === "string" ? dataBR(entrada.ate) : "?";
  const motivo = textoCurto(entrada.motivo, "motivo", 80);
  return `${verbo} as noites de ${de} a ${ate} (inclusive) do imóvel ${nome} na Hostex${motivo ? ` — ${motivo}` : ""}. Vale para Airbnb e Booking.`;
}

const hostexBloquearDatas: FerramentaIA = {
  nome: "hostex_bloquear_datas",
  descricao:
    "Bloqueia noites de um imóvel no calendário mestre da Hostex (fecha a venda no Airbnb, Booking e site). Datas inclusivas: 'de' é a primeira noite e 'ate' a última. Antes de pedir, confira a disponibilidade do período e avise se houver reserva aceita dentro dele: a Hostex não cancela reserva, mas o bloqueio por cima gera conflito. Só executa depois que a pessoa confirmar o cartão. Para pedido de proprietário em /admin/bloqueios-datas, use esta ferramenta depois de aprovar.",
  schema: schemaDatasHostex,
  nivel: "escrita",
  papeis: HOSTEX_ESCRITA,
  imovelParam: "property_id",
  resumo: (entrada, ctx) => resumoDatas(ctx, entrada, "Bloquear"),
  executar: (ctx, entrada) => mudarDisponibilidade(ctx, entrada, false),
};

const hostexLiberarDatas: FerramentaIA = {
  nome: "hostex_liberar_datas",
  descricao:
    "Libera (desbloqueia) noites de um imóvel no calendário mestre da Hostex, reabrindo a venda nos canais. Datas inclusivas. Não mexe em reservas: se houver reserva no período, ela continua. Só executa depois que a pessoa confirmar o cartão.",
  schema: schemaDatasHostex,
  nivel: "escrita",
  papeis: HOSTEX_ESCRITA,
  imovelParam: "property_id",
  resumo: (entrada, ctx) => resumoDatas(ctx, entrada, "Liberar"),
  executar: (ctx, entrada) => mudarDisponibilidade(ctx, entrada, true),
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

export const CATALOGO_ESCRITA: FerramentaIA[] = [
  hostexBloquearDatas,
  hostexLiberarDatas,
  abrirChamado,
  responderChamado,
  mudarStatusChamado,
  registrarAjuste,
  registrarCompra,
  registrarTarefaRua,
];
