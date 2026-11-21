import { diaDaSemana, diaDe, deDia, paraDia, type DiaAnunciado, type ReservaCalculada, type ResultadoImovel } from "@/lib/resultadosImovel";

/**
 * O que vem pela frente no imóvel: as noites que ainda estão à venda e o ritmo
 * em que os próximos meses estão sendo reservados. Tudo sai das reservas e do
 * calendário que a página já carregou; nada aqui volta ao banco.
 */

/* ------------------------------------------------------------------------ */
/* Noites à venda                                                            */
/* ------------------------------------------------------------------------ */

/** Anúncio novo nasce com R$ 20.000 de "preço de proteção": não é preço de venda. */
const PRECO_DE_PROTECAO_CENTS = 1_900_000;

export type SituacaoDaNoite = "reservada" | "a_venda" | "fechada";

export interface NoiteAFrente {
  dia: number;
  situacao: SituacaoDaNoite;
  /** Preço anunciado hoje para a noite; null quando o anúncio não tem preço de venda. */
  precoCents: number | null;
  /** Mínimo de noites para quem reserva começando nesse dia */
  minimo: number | null;
  /** Noite de sexta ou de sábado */
  fimDeSemana: boolean;
}

export interface NoitesAVenda {
  noites: NoiteAFrente[];
  aVenda: number;
  reservadas: number;
  /** Fechadas no calendário sem reserva: bloqueio do proprietário, da limpeza ou da equipe */
  fechadas: number;
  /** Soma do preço anunciado das noites à venda */
  valorCents: number;
  precoMinCents: number | null;
  precoMaxCents: number | null;
}

/**
 * Os próximos `dias` dias, noite a noite. "À venda" é noite aberta no anúncio e
 * sem reserva. Devolve null quando o imóvel não tem calendário de preços (sem
 * anúncio ligado à Hostex): sem ele não dá para dizer o que está à venda.
 */
export function noitesAVenda(calendario: DiaAnunciado[], reservas: ReservaCalculada[], hoje: number, dias = 30): NoitesAVenda | null {
  if (calendario.length === 0) return null;
  const anunciado = new Map(calendario.map((c) => [paraDia(c.d), c]));
  const ocupadas = new Set<number>();
  for (const r of reservas) {
    for (let d = Math.max(r.ci, hoje); d < Math.min(r.co, hoje + dias); d++) ocupadas.add(d);
  }

  const noites: NoiteAFrente[] = [];
  let aVenda = 0;
  let reservadas = 0;
  let fechadas = 0;
  let valorCents = 0;
  let precoMinCents: number | null = null;
  let precoMaxCents: number | null = null;

  for (let dia = hoje; dia < hoje + dias; dia++) {
    const c = anunciado.get(dia);
    const reservada = ocupadas.has(dia);
    // dia fora do calendário e sem reserva: não se sabe, fica de fora
    if (!c && !reservada) continue;
    const semana = diaDaSemana(dia);
    const fimDeSemana = semana === 5 || semana === 6;
    if (reservada) {
      reservadas += 1;
      noites.push({ dia, situacao: "reservada", precoCents: null, minimo: null, fimDeSemana });
      continue;
    }
    if (!c!.livre) {
      fechadas += 1;
      noites.push({ dia, situacao: "fechada", precoCents: null, minimo: null, fimDeSemana });
      continue;
    }
    const preco = c!.preco_cents != null && c!.preco_cents > 0 && c!.preco_cents < PRECO_DE_PROTECAO_CENTS ? c!.preco_cents : null;
    aVenda += 1;
    if (preco != null) {
      valorCents += preco;
      precoMinCents = precoMinCents == null ? preco : Math.min(precoMinCents, preco);
      precoMaxCents = precoMaxCents == null ? preco : Math.max(precoMaxCents, preco);
    }
    noites.push({ dia, situacao: "a_venda", precoCents: preco, minimo: c!.min, fimDeSemana });
  }

  if (noites.length === 0) return null;
  return { noites, aVenda, reservadas, fechadas, valorCents, precoMinCents, precoMaxCents };
}

/* ------------------------------------------------------------------------ */
/* Ritmo de venda                                                            */
/* ------------------------------------------------------------------------ */

export interface RitmoMes {
  /** "aaaa-mm" */
  chave: string;
  ano: number;
  mes0: number;
  dias: number;
  /** Noites do imóvel já reservadas no mês */
  noites: number;
  /** Parte do mês já reservada no imóvel (0 a 1) */
  imovel: number;
  /** O mesmo, na média dos imóveis ativos da RIOS; null se a consulta ainda não traz */
  carteira: number | null;
  imoveisNaCarteira: number | null;
  /** O mesmo, nos imóveis em volta (PriceLabs), no dia da coleta */
  mercado: number | null;
  /** Onde o mercado em volta fechou esse mesmo mês no ano passado */
  mercadoAnoPassado: number | null;
  /** Quando o dado do mercado foi coletado ("aaaa-mm-dd…") */
  mercadoEm: string | null;
}

/** Abaixo disso a média da carteira é ruído. */
const MIN_IMOVEIS_CARTEIRA = 8;

/**
 * Quanto de cada um dos próximos meses já está reservado: no imóvel, na
 * carteira da RIOS e no mercado em volta. Começa no mês que vem: o mês em
 * andamento mistura noite que já aconteceu com noite reservada, e o dado de
 * mercado dele cobre só os dias que faltavam no dia da coleta.
 */
export function ritmoDeVenda(reservas: ReservaCalculada[], dados: Pick<ResultadoImovel, "mercado" | "ritmo">, hoje: number, meses = 3): RitmoMes[] {
  const d = deDia(hoje);
  const carteira = new Map((dados.ritmo ?? []).map((r) => [r.mes, r]));
  const mercado = new Map((dados.mercado ?? []).filter((m) => m.origem === "futuro").map((m) => [m.mes, m]));
  const lista: RitmoMes[] = [];
  for (let i = 1; i <= meses; i++) {
    const base = new Date(d.getFullYear(), d.getMonth() + i, 1);
    const ano = base.getFullYear();
    const mes0 = base.getMonth();
    const inicio = diaDe(ano, mes0);
    const fim = diaDe(ano, mes0 + 1);
    const dias = fim - inicio;
    let noites = 0;
    for (const r of reservas) noites += Math.max(0, Math.min(r.co, fim) - Math.max(r.ci, inicio));
    noites = Math.min(noites, dias);
    const chave = `${ano}-${String(mes0 + 1).padStart(2, "0")}`;
    const c = carteira.get(chave);
    const m = mercado.get(chave);
    lista.push({
      chave,
      ano,
      mes0,
      dias,
      noites,
      imovel: noites / dias,
      carteira: c && c.imoveis >= MIN_IMOVEIS_CARTEIRA && c.reservado != null ? c.reservado : null,
      imoveisNaCarteira: c?.imoveis ?? null,
      mercado: m?.ocupacao ?? null,
      mercadoAnoPassado: m?.ocupacao_ano_anterior ?? null,
      mercadoEm: m?.coletado_em ?? null,
    });
  }
  return lista;
}
