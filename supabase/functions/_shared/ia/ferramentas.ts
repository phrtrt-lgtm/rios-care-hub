// Catálogo de ferramentas do assistente (Fase 1: só leitura).
//
// Toda ferramenta lê com `ctx.userClient` (JWT do usuário → RLS). Toda
// ferramenta com imóvel passa por `exigirAcessoImovel`. Proprietário nunca
// recebe nome, telefone ou e-mail de hóspede. Ver PLANO_IA_AGENTE.md §3.
import {
  type Contexto,
  type FerramentaIA,
  LIMITES,
  PAPEIS_EQUIPE,
  brl,
  dataDe,
  diaNum,
  ehUuid,
  exigirAcessoImovel,
  janela,
  limitar,
  somarDias,
  textoCurto,
  ErroFerramenta,
} from "./politica.ts";
import { CATALOGO_ESCRITA } from "./ferramentas-escrita.ts";
import { hostexGet } from "../hostexReserva.ts";

const TODOS = [...PAPEIS_EQUIPE, "owner" as const];

// Mesmos conjuntos de src/lib/cobrancaMeta.ts e src/lib/vencimento.ts.
const COBRANCA_PAGAS = ["paid", "pago_antecipado", "pago_no_vencimento", "pago_com_atraso"];
const COBRANCA_EM_ABERTO = [
  "sent", "pendente", "pending", "overdue", "under_review", "debit_notice_sent", "contested", "aguardando_reserva",
];
const RESERVA_OCUPA = ["accepted", "confirmed"];

type Linha = Record<string, unknown>;

function falhou(error: { message: string } | null, oQue: string): void {
  if (error) throw new ErroFerramenta(`Não consegui ler ${oQue}: ${error.message}`);
}

const nomeDe = (rel: unknown): string | null => {
  if (!rel) return null;
  const r = Array.isArray(rel) ? rel[0] : rel;
  return (r as { name?: string } | undefined)?.name ?? null;
};

// ---------------------------------------------------------------- imóveis

const listarImoveis: FerramentaIA = {
  nome: "listar_imoveis",
  descricao:
    "Lista os imóveis que o usuário pode ver (id, nome, endereço). Use para achar o id de um imóvel pelo nome quando ele não estiver no contexto. Equipe vê todos; proprietário vê só os dele.",
  schema: {
    type: "object",
    properties: {
      busca: { type: "string", description: "Parte do nome do imóvel (opcional)." },
    },
    additionalProperties: false,
  },
  nivel: "leitura",
  papeis: TODOS,
  async executar(ctx, entrada) {
    const busca = textoCurto(entrada.busca, "busca", 60);
    let q = ctx.userClient
      .from("properties")
      .select("id, name, address, default_commission_percentage")
      .is("archived_at", null)
      .order("name")
      .limit(LIMITES.linhas);
    if (busca) q = q.ilike("name", `%${busca}%`);
    const { data, error } = await q;
    falhou(error, "os imóveis");
    return {
      total: data?.length ?? 0,
      imoveis: (data ?? []).map((p: Linha) => ({
        id: p.id,
        nome: p.name,
        endereco: p.address,
        ...(ctx.equipe ? { comissao_padrao_pct: p.default_commission_percentage } : {}),
      })),
    };
  },
};

// --------------------------------------------------------------- reservas

async function reservasNoPeriodo(ctx: Contexto, propertyId: string, de: string, ate: string) {
  const { data, error } = await ctx.userClient
    .from("hostex_reservations")
    .select(
      "reservation_code, channel_type, check_in_date, check_out_date, nights, guests, status, stay_status, total_rate_cents, guest_name, synced_at, booked_at",
    )
    .eq("property_id", propertyId)
    .lte("check_in_date", ate)
    .gte("check_out_date", de)
    .order("check_in_date")
    .limit(LIMITES.linhas);
  falhou(error, "as reservas");
  return (data ?? []) as Linha[];
}

async function bloqueiosNoPeriodo(ctx: Contexto, propertyId: string, de: string, ate: string) {
  const { data, error } = await ctx.userClient
    .from("date_block_requests")
    .select("start_date, end_date, reason, status, created_at")
    .eq("property_id", propertyId)
    .in("status", ["pending", "processed"])
    .lte("start_date", ate)
    .gte("end_date", de)
    .order("start_date")
    .limit(LIMITES.linhas);
  falhou(error, "os bloqueios");
  return (data ?? []) as Linha[];
}

const fonteCache = (linhas: Linha[]): string => {
  const ultima = linhas.map((r) => String(r.synced_at ?? "")).sort().pop();
  return ultima ? `cache da Hostex, coletado em ${ultima.slice(0, 16).replace("T", " ")} (UTC)` : "cache da Hostex";
};

const reservasDoImovel: FerramentaIA = {
  nome: "reservas_do_imovel",
  descricao:
    "Reservas de um imóvel num período (padrão: de hoje a 90 dias), pelo cache da Hostex, mais os pedidos de bloqueio de datas do proprietário. Devolve código, canal, check-in, check-out, noites, hóspedes, status e valor. Para a equipe inclui o nome do hóspede; para o proprietário, não. Não serve para saber se está livre: use disponibilidade.",
  schema: {
    type: "object",
    properties: {
      property_id: { type: "string", description: "Id do imóvel." },
      de: { type: "string", description: "Início do período, AAAA-MM-DD (padrão: hoje)." },
      ate: { type: "string", description: "Fim do período, AAAA-MM-DD (padrão: 90 dias depois de 'de')." },
    },
    required: ["property_id"],
    additionalProperties: false,
  },
  nivel: "leitura",
  papeis: TODOS,
  imovelParam: "property_id",
  async executar(ctx, entrada) {
    const imovel = await exigirAcessoImovel(ctx, entrada.property_id);
    const de0 = (entrada.de as string | undefined) ?? ctx.hoje;
    const { de, ate } = janela(de0, (entrada.ate as string | undefined) ?? somarDias(de0, 90));
    const [reservas, bloqueios] = await Promise.all([
      reservasNoPeriodo(ctx, imovel.id, de, ate),
      bloqueiosNoPeriodo(ctx, imovel.id, de, ate),
    ]);
    return {
      imovel: imovel.name,
      periodo: { de, ate },
      fonte: fonteCache(reservas),
      reservas: reservas.map((r) => ({
        codigo: r.reservation_code,
        canal: r.channel_type,
        check_in: r.check_in_date,
        check_out: r.check_out_date,
        noites: r.nights,
        hospedes: r.guests,
        status: r.status,
        estadia: r.stay_status,
        valor_total: brl(r.total_rate_cents as number | null),
        reservada_em: r.booked_at ? String(r.booked_at).slice(0, 10) : null,
        ...(ctx.equipe ? { hospede: r.guest_name } : {}),
      })),
      bloqueios_do_proprietario: bloqueios.map((b) => ({
        entrada: b.start_date,
        saida: b.end_date,
        motivo: b.reason === "family_visit" ? "uso pessoal" : "manutenção",
        status: b.status === "processed" ? "bloqueado" : "pedido pendente",
      })),
    };
  },
};

const disponibilidade: FerramentaIA = {
  nome: "disponibilidade",
  descricao:
    "Noites livres e ocupadas de um imóvel num período (padrão: de hoje a 60 dias), pelo cache da Hostex e pelos bloqueios processados. Devolve total de noites, ocupadas, livres e as janelas livres (de/até/noites). Use para 'está livre em…', 'quais datas estão abertas'.",
  schema: {
    type: "object",
    properties: {
      property_id: { type: "string", description: "Id do imóvel." },
      de: { type: "string", description: "Início, AAAA-MM-DD (padrão: hoje)." },
      ate: { type: "string", description: "Fim, AAAA-MM-DD (padrão: 60 dias depois de 'de')." },
    },
    required: ["property_id"],
    additionalProperties: false,
  },
  nivel: "leitura",
  papeis: TODOS,
  imovelParam: "property_id",
  async executar(ctx, entrada) {
    const imovel = await exigirAcessoImovel(ctx, entrada.property_id);
    const de0 = (entrada.de as string | undefined) ?? ctx.hoje;
    const { de, ate, dias } = janela(de0, (entrada.ate as string | undefined) ?? somarDias(de0, 60));
    const [reservas, bloqueios] = await Promise.all([
      reservasNoPeriodo(ctx, imovel.id, de, ate),
      bloqueiosNoPeriodo(ctx, imovel.id, de, ate),
    ]);
    const ini = diaNum(de);
    const fim = diaNum(ate); // noites: de `de` até a véspera de `ate`
    const ocupada = new Array<boolean>(Math.max(fim - ini, 0)).fill(false);
    const marcar = (a: string, b: string) => {
      for (let n = Math.max(diaNum(a), ini); n < Math.min(diaNum(b), fim); n++) ocupada[n - ini] = true;
    };
    for (const r of reservas) {
      if (RESERVA_OCUPA.includes(String(r.status))) marcar(String(r.check_in_date), String(r.check_out_date));
    }
    // end_date do pedido é a saída (manhã livre): a última noite é a véspera.
    for (const b of bloqueios) {
      if (b.status === "processed") marcar(String(b.start_date), String(b.end_date));
    }
    // Equipe: o calendário mestre ao vivo da Hostex manda sobre o cache (bloqueios
    // feitos pela Central Hostex ou pela IA não existem no banco).
    let fonte = fonteCache(reservas);
    if (ctx.equipe) {
      const apiKey = Deno.env.get("HOSTEX_API_KEY");
      const { data: hx } = await ctx.userClient.from("hostex_properties").select("id_hostex").eq("property_id", imovel.id).limit(1).maybeSingle();
      if (apiKey && hx?.id_hostex && dias <= 366) {
        try {
          const resp = await hostexGet("/availabilities", { property_ids: hx.id_hostex, start_date: de, end_date: dataDe(fim - 1) }, apiKey);
          const diasHx: Linha[] = resp?.data?.properties?.[0]?.availabilities ?? [];
          if (diasHx.length > 0) {
            ocupada.fill(false);
            for (const d of diasHx) {
              const n = diaNum(String(d.date));
              if (d.available === false && n >= ini && n < fim) ocupada[n - ini] = true;
            }
            fonte = "calendário mestre da Hostex, ao vivo";
          }
        } catch (e) {
          console.warn("[ia] availabilities da Hostex:", e);
        }
      }
    }
    const janelas: Array<{ de: string; ate: string; noites: number }> = [];
    let aberta: number | null = null;
    for (let i = 0; i <= ocupada.length; i++) {
      const livre = i < ocupada.length && !ocupada[i];
      if (livre && aberta === null) aberta = i;
      if (!livre && aberta !== null) {
        janelas.push({ de: dataDe(ini + aberta), ate: dataDe(ini + i), noites: i - aberta });
        aberta = null;
      }
    }
    const noitesOcupadas = ocupada.filter(Boolean).length;
    return {
      imovel: imovel.name,
      periodo: { de, ate, noites: dias },
      fonte,
      noites_ocupadas: noitesOcupadas,
      noites_livres: dias - noitesOcupadas,
      janelas_livres: janelas.slice(0, 30),
      observacao: "Check-out é a manhã da data 'ate' da janela: a última noite livre é a véspera.",
    };
  },
};

const resultadosDoImovel: FerramentaIA = {
  nome: "resultados_do_imovel",
  descricao:
    "Resumo mensal de desempenho de um imóvel pelo cache da Hostex: noites reservadas, ocupação %, diárias (valor das reservas rateado por noite) e divisão por canal, dos últimos N meses até o mês atual (padrão 6, máximo 12). É estimativa; o número oficial é o relatório financeiro. Use para 'como está indo o imóvel', 'ocupação de setembro', 'quanto faturou'.",
  schema: {
    type: "object",
    properties: {
      property_id: { type: "string", description: "Id do imóvel." },
      meses: { type: "integer", description: "Quantos meses para trás, incluindo o atual (1 a 12; padrão 6)." },
    },
    required: ["property_id"],
    additionalProperties: false,
  },
  nivel: "leitura",
  papeis: TODOS,
  imovelParam: "property_id",
  async executar(ctx, entrada) {
    const imovel = await exigirAcessoImovel(ctx, entrada.property_id);
    const meses = limitar(entrada.meses ?? 6, 12);
    const [anoHoje, mesHoje] = ctx.hoje.split("-").map(Number);
    const fimMesAtual = new Date(Date.UTC(anoHoje, mesHoje, 0)); // último dia do mês atual
    const ateExclusivo = dataDe(diaNum(fimMesAtual.toISOString().slice(0, 10)) + 1);
    const inicio = new Date(Date.UTC(anoHoje, mesHoje - meses, 1)).toISOString().slice(0, 10);
    const { de, ate } = janela(inicio, ateExclusivo);
    const { data, error } = await ctx.userClient
      .from("hostex_reservations")
      .select("check_in_date, check_out_date, nights, total_rate_cents, status, channel_type, synced_at")
      .eq("property_id", imovel.id)
      .in("status", RESERVA_OCUPA)
      .lt("check_in_date", ate)
      .gt("check_out_date", de)
      .limit(400);
    falhou(error, "as reservas");
    const reservas = (data ?? []) as Linha[];

    type Mes = { noites: number; diarias_cents: number; por_canal: Record<string, number> };
    const porMes = new Map<string, Mes>();
    for (let k = 0; k < meses; k++) {
      const d = new Date(Date.UTC(anoHoje, mesHoje - 1 - k, 1));
      porMes.set(d.toISOString().slice(0, 7), { noites: 0, diarias_cents: 0, por_canal: {} });
    }
    for (const r of reservas) {
      const a = diaNum(String(r.check_in_date));
      const b = diaNum(String(r.check_out_date));
      const noites = Math.max(b - a, 1);
      const porNoite = ((r.total_rate_cents as number | null) ?? 0) / noites;
      const canal = String(r.channel_type ?? "outro");
      for (let n = a; n < b; n++) {
        const chave = dataDe(n).slice(0, 7);
        const m = porMes.get(chave);
        if (!m) continue;
        m.noites += 1;
        m.diarias_cents += porNoite;
        m.por_canal[canal] = (m.por_canal[canal] ?? 0) + 1;
      }
    }
    const diasNoMes = (chave: string) => {
      const [a, m] = chave.split("-").map(Number);
      return new Date(Date.UTC(a, m, 0)).getUTCDate();
    };
    const linhas = [...porMes.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, m]) => ({
        mes,
        noites_reservadas: m.noites,
        ocupacao_pct: Math.round((m.noites / diasNoMes(mes)) * 100),
        diarias: brl(Math.round(m.diarias_cents)),
        noites_por_canal: m.por_canal,
      }));
    const totalNoites = linhas.reduce((s, l) => s + l.noites_reservadas, 0);
    const totalCents = [...porMes.values()].reduce((s, m) => s + m.diarias_cents, 0);
    return {
      imovel: imovel.name,
      fonte: fonteCache(reservas),
      aviso: "Diárias = valor das reservas sem taxa de limpeza, rateado por noite. Comissão e líquido: só no relatório financeiro.",
      meses: linhas,
      total: { noites_reservadas: totalNoites, diarias: brl(Math.round(totalCents)) },
    };
  },
};

const estadoDosImoveisHoje: FerramentaIA = {
  nome: "estado_dos_imoveis_hoje",
  descricao:
    "Situação de cada imóvel ativo hoje: ocupado (com data de saída), saindo hoje, ou livre (com a próxima entrada), e o próximo check-out. Só datas, sem hóspede. Use para 'quem sai hoje', 'quais estão vazios', 'tem check-out amanhã'.",
  schema: { type: "object", properties: {}, additionalProperties: false },
  nivel: "leitura",
  papeis: PAPEIS_EQUIPE,
  async executar(ctx) {
    const { data, error } = await ctx.userClient.rpc("janela_imoveis");
    falhou(error, "o estado dos imóveis");
    const linhas = (data ?? []) as Linha[];
    const ids = linhas.map((l) => l.property_id as string);
    const { data: props } = await ctx.userClient.from("properties").select("id, name").in("id", ids);
    const nome = new Map((props ?? []).map((p: Linha) => [p.id as string, p.name as string]));
    const estado = (l: Linha) => {
      if (!l.saida) return "livre";
      return l.saida === ctx.hoje ? "sai hoje" : "ocupado";
    };
    return {
      hoje: ctx.hoje,
      imoveis: linhas
        .map((l) => ({
          imovel: nome.get(l.property_id as string) ?? l.property_id,
          estado: estado(l),
          saida: l.saida ?? null,
          proxima_entrada: l.proxima_entrada ?? null,
          proximo_checkout: l.proximo_checkout ?? null,
        }))
        .sort((a, b) => String(a.imovel).localeCompare(String(b.imovel))),
    };
  },
};

// --------------------------------------------------------------- chamados

const SELECT_TICKET =
  "id, subject, status, priority, ticket_type, kind, natureza, cost_responsible, on_hold, created_at, updated_at, property:properties(name), owner:profiles!tickets_owner_id_fkey(name)";

function linhaTicket(ctx: Contexto, t: Linha) {
  return {
    id: t.id,
    assunto: t.subject,
    status: t.status,
    prioridade: t.priority,
    tipo: t.ticket_type,
    origem: t.kind === "maintenance" ? "manutenção" : null,
    imovel: nomeDe(t.property),
    ...(ctx.equipe ? { proprietario: nomeDe(t.owner) } : {}),
    criado_em: String(t.created_at).slice(0, 10),
    atualizado_em: String(t.updated_at).slice(0, 10),
  };
}

const chamados: FerramentaIA = {
  nome: "chamados",
  descricao:
    "Lista chamados (tickets) com filtros: status ('abertos' = nem concluído nem cancelado, ou um status exato: novo, em_analise, aguardando_info, em_execucao, concluido, cancelado), imóvel, texto no assunto. Mais recentes primeiro. Não inclui as manutenções da lista da equipe; para elas use manutencoes.",
  schema: {
    type: "object",
    properties: {
      status: { type: "string", description: "'abertos' (padrão), 'todos' ou um status exato." },
      property_id: { type: "string", description: "Id do imóvel (opcional)." },
      busca: { type: "string", description: "Texto para procurar no assunto (opcional)." },
      limite: { type: "integer", description: "Máximo de linhas (padrão 50)." },
    },
    additionalProperties: false,
  },
  nivel: "leitura",
  papeis: TODOS,
  imovelParam: "property_id",
  async executar(ctx, entrada) {
    const status = textoCurto(entrada.status, "status", 30) ?? "abertos";
    let q = ctx.userClient
      .from("tickets")
      .select(SELECT_TICKET)
      .is("archived_at", null)
      .neq("ticket_type", "manutencao")
      .order("updated_at", { ascending: false })
      .limit(limitar(entrada.limite));
    if (status === "abertos") q = q.not("status", "in", "(concluido,cancelado)");
    else if (status !== "todos") q = q.eq("status", status);
    if (entrada.property_id) {
      const imovel = await exigirAcessoImovel(ctx, entrada.property_id);
      q = q.eq("property_id", imovel.id);
    }
    const busca = textoCurto(entrada.busca, "busca", 60);
    if (busca) q = q.ilike("subject", `%${busca}%`);
    const { data, error } = await q;
    falhou(error, "os chamados");
    return { total: data?.length ?? 0, chamados: ((data ?? []) as Linha[]).map((t) => linhaTicket(ctx, t)) };
  },
};

const detalheChamado: FerramentaIA = {
  nome: "detalhe_chamado",
  descricao:
    "Um chamado completo: assunto, descrição, status, tipo, imóvel, datas e as últimas 20 mensagens da conversa (a equipe vê as notas internas; o proprietário não). Use quando a pessoa está numa página /ticket-detalhes/<id> ou pede 'o que aconteceu no chamado tal'.",
  schema: {
    type: "object",
    properties: { id: { type: "string", description: "Id do chamado (uuid)." } },
    required: ["id"],
    additionalProperties: false,
  },
  nivel: "leitura",
  papeis: TODOS,
  async executar(ctx, entrada) {
    if (!ehUuid(entrada.id)) throw new ErroFerramenta("Informe o id do chamado (uuid).");
    const { data: t, error } = await ctx.userClient
      .from("tickets")
      .select(`${SELECT_TICKET}, description, essential, owner_decision, owner_action_due_at, scheduled_at, charge_draft_amount_cents`)
      .eq("id", entrada.id)
      .maybeSingle();
    falhou(error, "o chamado");
    if (!t) throw new ErroFerramenta("Chamado não encontrado ou sem acesso.");
    let q = ctx.userClient
      .from("ticket_messages")
      .select("body, is_internal, created_at, autor:profiles(name, role)")
      .eq("ticket_id", entrada.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!ctx.equipe) q = q.eq("is_internal", false);
    const { data: msgs, error: e2 } = await q;
    if (e2) console.warn("[ia] mensagens do chamado:", e2.message);
    const tt = t as Linha;
    return {
      ...linhaTicket(ctx, tt),
      descricao: String(tt.description ?? "").slice(0, 2000),
      essencial: tt.essential,
      decisao_do_proprietario: tt.owner_decision,
      prazo_decisao: tt.owner_action_due_at,
      agendado_para: tt.scheduled_at,
      valor_previsto: brl(tt.charge_draft_amount_cents as number | null),
      mensagens: (((msgs ?? []) as Linha[]).reverse()).map((m) => {
        const autor = Array.isArray(m.autor) ? m.autor[0] : m.autor;
        const a = autor as { name?: string; role?: string } | undefined;
        return {
          quando: String(m.created_at).slice(0, 16).replace("T", " "),
          de: a?.name ?? "?",
          lado: a?.role === "owner" ? "proprietário" : "equipe",
          interna: m.is_internal,
          texto: String(m.body ?? "").slice(0, 600),
        };
      }),
    };
  },
};

// -------------------------------------------------------------- cobranças

const SELECT_COBRANCA =
  "id, title, amount_cents, management_contribution_cents, credit_applied_cents, status, due_date, paid_at, sent_at, created_at, category, property:properties(name), owner:profiles!charges_owner_id_fkey(name)";

function linhaCobranca(ctx: Contexto, c: Linha) {
  const aPagar = (c.amount_cents as number) - ((c.management_contribution_cents as number) ?? 0) -
    ((c.credit_applied_cents as number) ?? 0);
  const emAberto = COBRANCA_EM_ABERTO.includes(String(c.status));
  return {
    id: c.id,
    titulo: c.title,
    valor: brl(c.amount_cents as number),
    aporte_rios: brl((c.management_contribution_cents as number) ?? 0),
    credito: brl((c.credit_applied_cents as number) ?? 0),
    a_pagar: brl(Math.max(aPagar, 0)),
    status: c.status,
    vencimento: c.due_date,
    vencida: emAberto && !!c.due_date && String(c.due_date) < ctx.hoje,
    paga_em: c.paid_at ? String(c.paid_at).slice(0, 10) : null,
    enviada_em: c.sent_at ? String(c.sent_at).slice(0, 10) : null,
    categoria: c.category,
    imovel: nomeDe(c.property),
    ...(ctx.equipe ? { proprietario: nomeDe(c.owner) } : {}),
  };
}

const cobrancas: FerramentaIA = {
  nome: "cobrancas",
  descricao:
    "Lista cobranças com filtros: situacao ('em_aberto' = esperando pagamento ou decisão, 'vencidas' = em aberto com vencimento passado, 'pagas', 'todas' sem rascunhos), imóvel, e, para a equipe, parte do nome do proprietário. Devolve valor, aporte da RIOS, crédito, a pagar, status, vencimento. Mais recentes primeiro.",
  schema: {
    type: "object",
    properties: {
      situacao: { type: "string", description: "'em_aberto' (padrão), 'vencidas', 'pagas' ou 'todas'." },
      property_id: { type: "string", description: "Id do imóvel (opcional)." },
      proprietario: { type: "string", description: "Parte do nome do proprietário (só equipe; opcional)." },
      limite: { type: "integer", description: "Máximo de linhas (padrão 50)." },
    },
    additionalProperties: false,
  },
  nivel: "leitura",
  papeis: TODOS,
  imovelParam: "property_id",
  async executar(ctx, entrada) {
    const situacao = textoCurto(entrada.situacao, "situacao", 20) ?? "em_aberto";
    let q = ctx.userClient
      .from("charges")
      .select(SELECT_COBRANCA)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(limitar(entrada.limite));
    if (situacao === "em_aberto") q = q.in("status", COBRANCA_EM_ABERTO);
    else if (situacao === "vencidas") q = q.in("status", COBRANCA_EM_ABERTO).lt("due_date", ctx.hoje);
    else if (situacao === "pagas") q = q.in("status", COBRANCA_PAGAS);
    else q = q.neq("status", "draft");
    if (entrada.property_id) {
      const imovel = await exigirAcessoImovel(ctx, entrada.property_id);
      q = q.eq("property_id", imovel.id);
    }
    const dono = textoCurto(entrada.proprietario, "proprietario", 60);
    if (dono && ctx.equipe) {
      const { data: perfis } = await ctx.userClient
        .from("profiles")
        .select("id")
        .eq("role", "owner")
        .ilike("name", `%${dono}%`)
        .limit(20);
      const ids = (perfis ?? []).map((p: Linha) => p.id as string);
      if (ids.length === 0) return { total: 0, cobrancas: [], aviso: `Nenhum proprietário com "${dono}".` };
      q = q.in("owner_id", ids);
    }
    const { data, error } = await q;
    falhou(error, "as cobranças");
    const linhas = ((data ?? []) as Linha[]).map((c) => linhaCobranca(ctx, c));
    const totalAPagar = ((data ?? []) as Linha[]).reduce(
      (s, c) =>
        s + Math.max((c.amount_cents as number) - ((c.management_contribution_cents as number) ?? 0) -
          ((c.credit_applied_cents as number) ?? 0), 0),
      0,
    );
    return { total: linhas.length, soma_a_pagar: brl(totalAPagar), cobrancas: linhas };
  },
};

const detalheCobranca: FerramentaIA = {
  nome: "detalhe_cobranca",
  descricao:
    "Uma cobrança completa: título, descrição, valores, status, vencimento, imóvel, chamado de origem e as últimas 20 mensagens da conversa dela. Use em /cobranca/<id> ou quando perguntarem 'por que estou sendo cobrado'.",
  schema: {
    type: "object",
    properties: { id: { type: "string", description: "Id da cobrança (uuid)." } },
    required: ["id"],
    additionalProperties: false,
  },
  nivel: "leitura",
  papeis: TODOS,
  async executar(ctx, entrada) {
    if (!ehUuid(entrada.id)) throw new ErroFerramenta("Informe o id da cobrança (uuid).");
    const { data: c, error } = await ctx.userClient
      .from("charges")
      .select(`${SELECT_COBRANCA}, description, ticket_id, contested_at, debited_at, cost_responsible, service_type`)
      .eq("id", entrada.id)
      .maybeSingle();
    falhou(error, "a cobrança");
    if (!c) throw new ErroFerramenta("Cobrança não encontrada ou sem acesso.");
    let q = ctx.userClient
      .from("charge_messages")
      .select("body, is_internal, created_at, autor:profiles(name, role)")
      .eq("charge_id", entrada.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!ctx.equipe) q = q.eq("is_internal", false);
    const { data: msgs, error: e2 } = await q;
    if (e2) console.warn("[ia] mensagens da cobrança:", e2.message);
    const cc = c as Linha;
    return {
      ...linhaCobranca(ctx, cc),
      descricao: String(cc.description ?? "").slice(0, 2000),
      chamado_id: cc.ticket_id,
      contestada_em: cc.contested_at,
      debitada_em: cc.debited_at,
      quem_paga: cc.cost_responsible,
      servico: cc.service_type,
      mensagens: (((msgs ?? []) as Linha[]).reverse()).map((m) => {
        const autor = Array.isArray(m.autor) ? m.autor[0] : m.autor;
        const a = autor as { name?: string; role?: string } | undefined;
        return {
          quando: String(m.created_at).slice(0, 16).replace("T", " "),
          de: a?.name ?? "?",
          lado: a?.role === "owner" ? "proprietário" : "equipe",
          interna: m.is_internal,
          texto: String(m.body ?? "").slice(0, 600),
        };
      }),
    };
  },
};

const cobrancasEmAtraso: FerramentaIA = {
  nome: "cobrancas_em_atraso",
  descricao:
    "Resumo por proprietário das cobranças em atraso de verdade (regra única cobrancas_em_atraso(): fora contestada, comprovante em análise, débito em reserva e sem saldo): quantidade, total a pagar e vencimento mais antigo. Use para 'quem está devendo', 'inadimplentes'.",
  schema: { type: "object", properties: {}, additionalProperties: false },
  nivel: "leitura",
  papeis: PAPEIS_EQUIPE,
  async executar(ctx) {
    const { data, error } = await ctx.userClient.rpc("cobrancas_em_atraso");
    falhou(error, "as cobranças em atraso");
    const linhas = (data ?? []) as Linha[];
    const porDono = new Map<string, { quantidade: number; total: number; mais_antiga: string }>();
    for (const l of linhas) {
      const id = l.owner_id as string;
      const atual = porDono.get(id) ?? { quantidade: 0, total: 0, mais_antiga: String(l.due_date) };
      atual.quantidade += 1;
      atual.total += Number(l.a_pagar_cents ?? 0);
      if (String(l.due_date) < atual.mais_antiga) atual.mais_antiga = String(l.due_date);
      porDono.set(id, atual);
    }
    const { data: perfis } = await ctx.userClient.from("profiles").select("id, name").in("id", [...porDono.keys()]);
    const nome = new Map((perfis ?? []).map((p: Linha) => [p.id as string, p.name as string]));
    const resumo = [...porDono.entries()]
      .map(([id, v]) => ({
        proprietario: nome.get(id) ?? id,
        quantidade: v.quantidade,
        total_a_pagar: brl(v.total),
        vencimento_mais_antigo: v.mais_antiga,
      }))
      .sort((a, b) => a.vencimento_mais_antigo.localeCompare(b.vencimento_mais_antigo));
    return {
      proprietarios: resumo.length,
      cobrancas: linhas.length,
      total_a_pagar: brl(linhas.reduce((s, l) => s + Number(l.a_pagar_cents ?? 0), 0)),
      por_proprietario: resumo.slice(0, LIMITES.linhas),
    };
  },
};

// ------------------------------------------------------------ manutenções

const manutencoes: FerramentaIA = {
  nome: "manutencoes",
  descricao:
    "Lista as manutenções (tickets de manutenção) por quadro: 'em_progresso' (abertas, fora stand-by), 'stand_by', 'aguardando_envio' (feitas e ainda não enviadas ao proprietário), 'concluidas' ou 'todas'; opcionalmente por imóvel. Devolve assunto, status, quem paga, valor previsto. Compras de imóvel novo ficam fora.",
  schema: {
    type: "object",
    properties: {
      quadro: { type: "string", description: "'em_progresso' (padrão), 'stand_by', 'aguardando_envio', 'concluidas' ou 'todas'." },
      property_id: { type: "string", description: "Id do imóvel (opcional)." },
      limite: { type: "integer", description: "Máximo de linhas (padrão 50)." },
    },
    additionalProperties: false,
  },
  nivel: "leitura",
  papeis: TODOS,
  imovelParam: "property_id",
  async executar(ctx, entrada) {
    const quadro = textoCurto(entrada.quadro, "quadro", 30) ?? "em_progresso";
    let q = ctx.userClient
      .from("tickets")
      .select(`${SELECT_TICKET}, charge_draft_amount_cents, charge_sent_at, essential, service_type, scheduled_at`)
      .eq("ticket_type", "manutencao")
      .eq("natureza", "manutencao")
      .is("archived_at", null)
      .neq("status", "cancelado")
      .order("updated_at", { ascending: false })
      .limit(limitar(entrada.limite));
    if (quadro === "em_progresso") q = q.neq("status", "concluido").eq("on_hold", false);
    else if (quadro === "stand_by") q = q.eq("on_hold", true).neq("status", "concluido");
    else if (quadro === "aguardando_envio") q = q.eq("status", "concluido").is("charge_sent_at", null);
    else if (quadro === "concluidas") q = q.eq("status", "concluido");
    if (entrada.property_id) {
      const imovel = await exigirAcessoImovel(ctx, entrada.property_id);
      q = q.eq("property_id", imovel.id);
    }
    const { data, error } = await q;
    falhou(error, "as manutenções");
    return {
      quadro,
      total: data?.length ?? 0,
      manutencoes: ((data ?? []) as Linha[]).map((t) => ({
        ...linhaTicket(ctx, t),
        quem_paga: t.cost_responsible,
        stand_by: t.on_hold,
        essencial: t.essential,
        servico: t.service_type,
        agendada_para: t.scheduled_at,
        valor_previsto: brl(t.charge_draft_amount_cents as number | null),
        enviada_ao_proprietario_em: t.charge_sent_at ? String(t.charge_sent_at).slice(0, 10) : null,
      })),
    };
  },
};

// ------------------------------------------------------------- proprietário

const buscarProprietario: FerramentaIA = {
  nome: "buscar_proprietario",
  descricao:
    "Procura proprietários por parte do nome, e-mail ou telefone e devolve contato, score de pagamento e os imóveis de cada um. Só equipe.",
  schema: {
    type: "object",
    properties: { termo: { type: "string", description: "Nome, e-mail ou telefone (ou parte)." } },
    required: ["termo"],
    additionalProperties: false,
  },
  nivel: "leitura",
  papeis: PAPEIS_EQUIPE,
  async executar(ctx, entrada) {
    const termo = textoCurto(entrada.termo, "termo", 60);
    if (!termo || termo.length < 2) throw new ErroFerramenta("Informe ao menos 2 caracteres.");
    const like = `%${termo.replace(/[%_]/g, "")}%`;
    const { data, error } = await ctx.userClient
      .from("profiles")
      .select("id, name, email, phone, payment_score, status, notificar_whatsapp")
      .in("role", ["owner", "pending_owner"])
      .or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
      .order("name")
      .limit(10);
    falhou(error, "os proprietários");
    const ids = (data ?? []).map((p: Linha) => p.id as string);
    const { data: props } = ids.length
      ? await ctx.userClient.from("properties").select("owner_id, name").in("owner_id", ids).is("archived_at", null)
      : { data: [] as Linha[] };
    const porDono = new Map<string, string[]>();
    for (const p of (props ?? []) as Linha[]) {
      const lista = porDono.get(p.owner_id as string) ?? [];
      lista.push(p.name as string);
      porDono.set(p.owner_id as string, lista);
    }
    return {
      total: data?.length ?? 0,
      proprietarios: ((data ?? []) as Linha[]).map((p) => ({
        id: p.id,
        nome: p.name,
        email: p.email,
        telefone: p.phone,
        score: p.payment_score,
        situacao: p.status,
        whatsapp_cobranca: p.notificar_whatsapp,
        imoveis: porDono.get(p.id as string) ?? [],
      })),
    };
  },
};

// ------------------------------------------------------------------ listas

async function contar(ctx: Contexto, tabela: string, filtro: (q: any) => any): Promise<number | null> {
  const { count, error } = await filtro(ctx.userClient.from(tabela).select("id", { count: "exact", head: true }));
  if (error) {
    console.warn(`[ia] contagem ${tabela}:`, error.message);
    return null;
  }
  return count ?? 0;
}

const pendenciasDasListas: FerramentaIA = {
  nome: "pendencias_das_listas",
  descricao:
    "Contagem do que está pendente nas listas da equipe: ajustes abertos (e urgentes), compras a comprar, tarefas de rua a fazer, pedidos de bloqueio de datas aguardando, avisos de hóspede a cobrar. Use para 'o que está pendente', 'resumo do dia'.",
  schema: { type: "object", properties: {}, additionalProperties: false },
  nivel: "leitura",
  papeis: PAPEIS_EQUIPE,
  async executar(ctx) {
    const [ajustes, urgentes, compras, tarefas, bloqueios, chamadosAbertos, manutencoesAbertas] = await Promise.all([
      contar(ctx, "ajustes", (q) => q.eq("status", "aberto")),
      contar(ctx, "ajustes", (q) => q.eq("status", "aberto").eq("urgente", true)),
      contar(ctx, "compras", (q) => q.eq("status", "pendente")),
      contar(ctx, "tarefas_rua", (q) => q.eq("status", "pendente")),
      contar(ctx, "date_block_requests", (q) => q.eq("status", "pending")),
      contar(ctx, "tickets", (q) =>
        q.is("archived_at", null).neq("ticket_type", "manutencao").not("status", "in", "(concluido,cancelado)")),
      contar(ctx, "tickets", (q) =>
        q.is("archived_at", null).eq("ticket_type", "manutencao").eq("natureza", "manutencao")
          .not("status", "in", "(concluido,cancelado)")),
    ]);
    return {
      hoje: ctx.hoje,
      ajustes_abertos: ajustes,
      ajustes_urgentes: urgentes,
      compras_pendentes: compras,
      tarefas_de_rua_pendentes: tarefas,
      pedidos_de_bloqueio_pendentes: bloqueios,
      chamados_abertos: chamadosAbertos,
      manutencoes_abertas: manutencoesAbertas,
      telas: {
        ajustes: "/ajustes",
        compras: "/compras",
        tarefas: "/tarefas-rua",
        bloqueios: "/admin/bloqueios-datas",
        chamados: "/todos-tickets?status=abertos",
        manutencoes: "/admin/manutencoes-lista",
      },
    };
  },
};

// --------------------------------------------------------------- vistorias

const vistoriasDoImovel: FerramentaIA = {
  nome: "vistorias_do_imovel",
  descricao:
    "Últimas vistorias de faxina de um imóvel (até 10): data, se é de rotina, se é interna, faxineira e o resumo da transcrição. Só equipe nesta fase.",
  schema: {
    type: "object",
    properties: {
      property_id: { type: "string", description: "Id do imóvel." },
      limite: { type: "integer", description: "Máximo de vistorias (padrão 10)." },
    },
    required: ["property_id"],
    additionalProperties: false,
  },
  nivel: "leitura",
  papeis: PAPEIS_EQUIPE,
  imovelParam: "property_id",
  async executar(ctx, entrada) {
    const imovel = await exigirAcessoImovel(ctx, entrada.property_id);
    const { data, error } = await ctx.userClient
      .from("cleaning_inspections")
      .select("id, created_at, is_routine, internal_only, cleaner_name, transcript_summary, notes")
      .eq("property_id", imovel.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(limitar(entrada.limite ?? 10, 10));
    falhou(error, "as vistorias");
    return {
      imovel: imovel.name,
      vistorias: ((data ?? []) as Linha[]).map((v) => ({
        id: v.id,
        data: String(v.created_at).slice(0, 10),
        rotina: v.is_routine === true,
        interna: v.internal_only === true,
        faxineira: v.cleaner_name,
        resumo: String(v.transcript_summary ?? v.notes ?? "").slice(0, 400) || null,
      })),
    };
  },
};

export const CATALOGO: FerramentaIA[] = [
  listarImoveis,
  reservasDoImovel,
  disponibilidade,
  resultadosDoImovel,
  estadoDosImoveisHoje,
  chamados,
  detalheChamado,
  cobrancas,
  detalheCobranca,
  cobrancasEmAtraso,
  manutencoes,
  buscarProprietario,
  pendenciasDasListas,
  vistoriasDoImovel,
  ...CATALOGO_ESCRITA,
];
