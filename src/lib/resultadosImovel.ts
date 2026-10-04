import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// A função resultados_imovel ainda não está no types.ts gerado; o cliente sem
// tipo evita o cast na chamada (mesmo padrão de lembreteAtraso.ts).
const db = supabase as unknown as SupabaseClient;

/**
 * Resultados do imóvel (dashboard do proprietário).
 *
 * Os dados vêm de uma chamada só, `resultados_imovel(property_id)`, que lê o
 * cache local da Hostex — abrir a página nunca chama a Hostex. Tudo o que a
 * tela mostra é calculado aqui, a partir das reservas, para o filtro de período
 * responder na hora sem voltar ao banco.
 *
 * Definições (as mesmas do relatório financeiro oficial, `report-calculations.ts`):
 * - diárias  = valor da reserva sem a taxa de limpeza;
 * - base     = diárias − taxa do canal;
 * - líquido  = base × (1 − comissão RIOS). É estimativa: o valor oficial é o
 *   do relatório financeiro.
 * Reserva que atravessa o período entra proporcional às noites dentro dele.
 */

// ===== Tipos =====

export interface ReservaResultado {
  id: string;
  canal: string;
  /** "aaaa-mm-dd" */
  check_in: string;
  check_out: string;
  hospedes: number | null;
  /** stay_completed · in_house · checkin_pending */
  situacao: string | null;
  reservado_em: string | null;
  total_cents: number;
  taxa_canal_cents: number;
  limpeza_cents: number;
  /** "BR-31" (DDD) ou "+54" (país). Nunca o telefone. */
  origem: string | null;
  /** Só vem preenchido para a equipe. */
  hospede: string | null;
}

export interface DiaAnunciado {
  d: string;
  preco_cents: number | null;
  livre: boolean;
  min: number | null;
}

export interface ReferenciaMes {
  /** "aaaa-mm" */
  mes: string;
  ocupacao: number | null;
  diaria_cents: number | null;
  imoveis: number;
}

export interface ResultadoImovel {
  imovel: { id: string; nome: string; endereco: string | null; capa: string | null };
  comissao_pct: number | null;
  primeira_reserva: string | null;
  reservas: ReservaResultado[];
  calendario: DiaAnunciado[];
  referencia: ReferenciaMes[];
  coletado_em: string | null;
  visao_equipe: boolean;
}

// ===== Consulta =====

export function useResultadosImovel(propertyId: string | undefined) {
  return useQuery({
    queryKey: ["resultados-imovel", propertyId],
    enabled: !!propertyId,
    // A coleta é diária: não há por que refazer a consulta a cada visita.
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<ResultadoImovel> => {
      const { data, error } = await db.rpc("resultados_imovel", { p_property_id: propertyId });
      if (error) throw error;
      return data as ResultadoImovel;
    },
  });
}

export { LIMITE_COLETA_HORAS, coletaEmDia, useColetaHostex } from "@/lib/coletaHostex";

// ===== Datas: tudo em "número do dia", para o fuso nunca deslocar uma noite =====

const DIA_MS = 86_400_000;

/** "2026-09-13" → número do dia (dias desde 1970, sem fuso). */
export function paraDia(data: string): number {
  const [a, m, d] = data.slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(a, m - 1, d) / DIA_MS);
}

/** Número do dia → Date à meia-noite local, para formatar. */
export function deDia(dia: number): Date {
  const u = new Date(dia * DIA_MS);
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate());
}

export function hojeDia(agora = new Date()): number {
  return Math.round(Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate()) / DIA_MS);
}

export function diaDe(ano: number, mes0: number, dia = 1): number {
  return Math.round(Date.UTC(ano, mes0, dia) / DIA_MS);
}

/** 0 = domingo … 6 = sábado */
export function diaDaSemana(dia: number): number {
  return new Date(dia * DIA_MS).getUTCDay();
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function formatarDia(dia: number, comAno = false): string {
  const u = new Date(dia * DIA_MS);
  const base = `${String(u.getUTCDate()).padStart(2, "0")}/${String(u.getUTCMonth() + 1).padStart(2, "0")}`;
  return comAno ? `${base}/${u.getUTCFullYear()}` : base;
}

export function formatarDiaExtenso(dia: number): string {
  const u = new Date(dia * DIA_MS);
  return `${u.getUTCDate()} de ${MESES_CURTOS[u.getUTCMonth()]}`;
}

export function nomeDoMes(ano: number, mes0: number, comAno = true): string {
  return comAno ? `${MESES[mes0]} de ${ano}` : MESES[mes0];
}

// ===== Dinheiro =====

export function reais(cents: number, casas: 0 | 2 = 0): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

/** R$ 12,4 mil · R$ 1,2 mi — para eixos e rótulos curtos. */
export function reaisCurto(cents: number): string {
  const v = cents / 100;
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
}

export function pct(fracao: number, casas = 0): string {
  return `${(fracao * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

// ===== Reserva =====

export interface ReservaCalculada extends ReservaResultado {
  ci: number;
  co: number;
  noites: number;
  /** Valor das diárias (sem limpeza), em centavos */
  diarias: number;
  /** Diárias − taxa do canal */
  base: number;
  diariaMedia: number;
  /** Dias entre a reserva e o check-in */
  antecedencia: number | null;
}

export function calcularReserva(r: ReservaResultado): ReservaCalculada {
  const ci = paraDia(r.check_in);
  const co = paraDia(r.check_out);
  const noites = Math.max(1, co - ci);
  const diarias = Math.max(0, r.total_cents - r.limpeza_cents);
  let antecedencia: number | null = null;
  if (r.reservado_em) {
    const feita = hojeDia(new Date(r.reservado_em));
    antecedencia = Math.max(0, ci - feita);
  }
  return {
    ...r,
    ci,
    co,
    noites,
    diarias,
    base: Math.max(0, diarias - r.taxa_canal_cents),
    diariaMedia: diarias / noites,
    antecedencia,
  };
}

/** Estimativa do líquido do proprietário para um valor-base (diárias − canal). */
export function liquidoEstimado(base: number, comissaoPct: number | null): number | null {
  if (comissaoPct == null || comissaoPct >= 100 || comissaoPct < 0) return null;
  return base * (1 - comissaoPct / 100);
}

// ===== Canais =====

export type CanalId = "airbnb" | "booking" | "direto" | "outros";

/** Ordem fixa: a cor segue o canal, nunca a posição no ranking. */
export const CANAIS: { id: CanalId; rotulo: string; cor: string }[] = [
  { id: "airbnb", rotulo: "Airbnb", cor: "hsl(var(--grafico-1))" },
  { id: "booking", rotulo: "Booking", cor: "hsl(var(--grafico-2))" },
  { id: "direto", rotulo: "Direto", cor: "hsl(var(--grafico-3))" },
  { id: "outros", rotulo: "Outros", cor: "hsl(var(--grafico-4))" },
];

export function canalDe(canal: string | null | undefined): CanalId {
  const c = (canal || "").toLowerCase();
  if (c.includes("airbnb")) return "airbnb";
  if (c.includes("booking")) return "booking";
  if (c.includes("direct") || c.includes("diret") || c === "hostex_direct") return "direto";
  return "outros";
}

export function infoCanal(canal: string | null | undefined) {
  const id = canalDe(canal);
  return CANAIS.find((c) => c.id === id)!;
}

// ===== Período =====

export type PeriodoId = "mes" | "30d" | "90d" | "ano" | "12m";

export interface Periodo {
  id: PeriodoId | "personalizado";
  rotulo: string;
  /** Inclusive */
  inicio: number;
  /** Exclusive */
  fim: number;
}

export const PERIODOS: { id: PeriodoId; rotulo: string }[] = [
  { id: "mes", rotulo: "Este mês" },
  { id: "30d", rotulo: "Últimos 30 dias" },
  { id: "90d", rotulo: "Últimos 90 dias" },
  { id: "ano", rotulo: "Este ano" },
  { id: "12m", rotulo: "Últimos 12 meses" },
];

export function periodoPorId(id: PeriodoId, hoje = hojeDia()): Periodo {
  const d = deDia(hoje);
  const rotulo = PERIODOS.find((p) => p.id === id)!.rotulo;
  switch (id) {
    case "mes":
      return { id, rotulo, inicio: diaDe(d.getFullYear(), d.getMonth()), fim: diaDe(d.getFullYear(), d.getMonth() + 1) };
    case "30d":
      return { id, rotulo, inicio: hoje - 30, fim: hoje };
    case "90d":
      return { id, rotulo, inicio: hoje - 90, fim: hoje };
    case "ano":
      return { id, rotulo, inicio: diaDe(d.getFullYear(), 0), fim: hoje + 1 };
    case "12m":
      return { id, rotulo, inicio: diaDe(d.getFullYear() - 1, d.getMonth(), d.getDate()), fim: hoje };
  }
}

export function periodoDoMes(ano: number, mes0: number): Periodo {
  return {
    id: "personalizado",
    rotulo: nomeDoMes(ano, mes0),
    inicio: diaDe(ano, mes0),
    fim: diaDe(ano, mes0 + 1),
  };
}

/** Período imediatamente anterior, com a mesma duração (para a variação). */
export function periodoAnterior(p: Periodo): Periodo {
  const dias = p.fim - p.inicio;
  return { id: "personalizado", rotulo: "período anterior", inicio: p.inicio - dias, fim: p.inicio };
}

// ===== Métricas =====

export interface Metricas {
  /** Diárias (sem limpeza), proporcional às noites dentro do período */
  receita: number;
  taxaCanal: number;
  base: number;
  limpeza: number;
  noites: number;
  disponiveis: number;
  ocupacao: number;
  diariaMedia: number;
  /** Receita por noite disponível */
  revpar: number;
  /** Reservas que tocam o período */
  reservas: number;
  estadiaMedia: number;
  antecedenciaMedia: number | null;
  hospedesMedios: number | null;
}

/**
 * Métricas de [inicio, fim). `primeira` é o dia da primeira reserva conhecida:
 * antes dele não há histórico, e contar aquelas noites como "vazias" derrubaria
 * a ocupação injustamente.
 */
export function metricas(reservas: ReservaCalculada[], inicio: number, fim: number, primeira?: number | null): Metricas {
  let receita = 0;
  let taxaCanal = 0;
  let limpeza = 0;
  let noites = 0;
  let qtd = 0;
  let somaEstadia = 0;
  let somaAntecedencia = 0;
  let comAntecedencia = 0;
  let somaHospedes = 0;
  let comHospedes = 0;

  for (const r of reservas) {
    const n = Math.min(r.co, fim) - Math.max(r.ci, inicio);
    if (n <= 0) continue;
    const parte = n / r.noites;
    receita += r.diarias * parte;
    taxaCanal += r.taxa_canal_cents * parte;
    limpeza += r.limpeza_cents * parte;
    noites += n;
    qtd += 1;
    somaEstadia += r.noites;
    if (r.antecedencia != null) {
      somaAntecedencia += r.antecedencia;
      comAntecedencia += 1;
    }
    if (r.hospedes) {
      somaHospedes += r.hospedes;
      comHospedes += 1;
    }
  }

  const inicioUtil = primeira != null ? Math.max(inicio, primeira) : inicio;
  const disponiveis = Math.max(0, fim - inicioUtil);
  const noitesValidas = Math.min(noites, disponiveis || noites);

  return {
    receita,
    taxaCanal,
    base: Math.max(0, receita - taxaCanal),
    limpeza,
    noites: noitesValidas,
    disponiveis,
    ocupacao: disponiveis > 0 ? Math.min(1, noitesValidas / disponiveis) : 0,
    diariaMedia: noites > 0 ? receita / noites : 0,
    revpar: disponiveis > 0 ? receita / disponiveis : 0,
    reservas: qtd,
    estadiaMedia: qtd > 0 ? somaEstadia / qtd : 0,
    antecedenciaMedia: comAntecedencia > 0 ? somaAntecedencia / comAntecedencia : null,
    hospedesMedios: comHospedes > 0 ? somaHospedes / comHospedes : null,
  };
}

/** Variação relativa entre dois valores; null quando não há base de comparação. */
export function variacao(atual: number, anterior: number): number | null {
  if (!Number.isFinite(anterior) || anterior <= 0) return null;
  return (atual - anterior) / anterior;
}

// ===== Série mensal =====

export interface MesSerie {
  chave: string; // "aaaa-mm"
  ano: number;
  mes0: number;
  rotulo: string; // "jul"
  inicio: number;
  fim: number;
  /** Diárias de noites já passadas */
  realizado: number;
  /** Diárias de noites de hoje em diante (já reservadas) */
  reservado: number;
  noites: number;
  disponiveis: number;
  ocupacao: number | null;
  diariaMedia: number;
  /** Média da carteira RIOS no mês (null se a amostra for pequena) */
  ocupacaoRios: number | null;
  futuro: boolean;
  atual: boolean;
}

/** Abaixo disso a "média RIOS" é ruído (início do histórico). */
const MIN_IMOVEIS_REFERENCIA = 8;

export function serieMensal(
  reservas: ReservaCalculada[],
  referencia: ReferenciaMes[],
  hoje: number,
  primeira: number | null,
  mesesAtras = 11,
  mesesAFrente = 3,
): MesSerie[] {
  const d = deDia(hoje);
  const ref = new Map(referencia.map((r) => [r.mes, r]));
  const serie: MesSerie[] = [];
  for (let i = -mesesAtras; i <= mesesAFrente; i++) {
    const base = new Date(d.getFullYear(), d.getMonth() + i, 1);
    const ano = base.getFullYear();
    const mes0 = base.getMonth();
    const inicio = diaDe(ano, mes0);
    const fim = diaDe(ano, mes0 + 1);
    // Mês inteiro antes da primeira reserva: fora do histórico.
    if (primeira != null && fim <= primeira) continue;
    const passado = metricas(reservas, inicio, Math.min(fim, hoje), primeira);
    const adiante = metricas(reservas, Math.max(inicio, hoje), fim, primeira);
    const tudo = metricas(reservas, inicio, fim, primeira);
    const chave = `${ano}-${String(mes0 + 1).padStart(2, "0")}`;
    const r = ref.get(chave);
    serie.push({
      chave,
      ano,
      mes0,
      rotulo: MESES_CURTOS[mes0],
      inicio,
      fim,
      realizado: fim <= hoje ? tudo.receita : inicio >= hoje ? 0 : passado.receita,
      reservado: inicio >= hoje ? tudo.receita : fim <= hoje ? 0 : adiante.receita,
      noites: tudo.noites,
      disponiveis: tudo.disponiveis,
      ocupacao: tudo.disponiveis > 0 ? tudo.ocupacao : null,
      diariaMedia: tudo.diariaMedia,
      ocupacaoRios: r && r.imoveis >= MIN_IMOVEIS_REFERENCIA && r.ocupacao != null ? r.ocupacao : null,
      futuro: inicio > hoje,
      atual: inicio <= hoje && hoje < fim,
    });
  }
  return serie;
}

/** Ocupação média da carteira RIOS em [inicio, fim), ponderada pelos dias de cada mês. */
export function ocupacaoRiosNoPeriodo(referencia: ReferenciaMes[], inicio: number, fim: number): number | null {
  let soma = 0;
  let dias = 0;
  for (const r of referencia) {
    if (r.ocupacao == null || r.imoveis < MIN_IMOVEIS_REFERENCIA) continue;
    const [a, m] = r.mes.split("-").map(Number);
    const n = Math.min(diaDe(a, m), fim) - Math.max(diaDe(a, m - 1), inicio);
    if (n <= 0) continue;
    soma += r.ocupacao * n;
    dias += n;
  }
  // Só compara se a referência cobre a maior parte do período.
  return dias >= (fim - inicio) * 0.6 ? soma / dias : null;
}

// ===== Recortes =====

export interface FatiaCanal {
  id: CanalId;
  rotulo: string;
  cor: string;
  receita: number;
  noites: number;
  reservas: number;
  parte: number;
}

export function mixCanais(reservas: ReservaCalculada[], inicio: number, fim: number): FatiaCanal[] {
  const acumulado = new Map<CanalId, { receita: number; noites: number; reservas: number }>();
  let total = 0;
  for (const r of reservas) {
    const n = Math.min(r.co, fim) - Math.max(r.ci, inicio);
    if (n <= 0) continue;
    const id = canalDe(r.canal);
    const a = acumulado.get(id) ?? { receita: 0, noites: 0, reservas: 0 };
    const valor = r.diarias * (n / r.noites);
    a.receita += valor;
    a.noites += n;
    a.reservas += 1;
    acumulado.set(id, a);
    total += valor;
  }
  return CANAIS.filter((c) => acumulado.has(c.id)).map((c) => {
    const a = acumulado.get(c.id)!;
    return { ...c, ...a, parte: total > 0 ? a.receita / total : 0 };
  });
}

export interface DiaSemana {
  rotulo: string;
  ocupacao: number;
  diariaMedia: number;
  noites: number;
  dias: number;
  fimDeSemana: boolean;
}

const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0]; // seg … dom
const NOMES_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Ocupação por dia da semana da noite (a noite de sexta é a que começa na sexta). */
export function ocupacaoPorDiaDaSemana(
  reservas: ReservaCalculada[],
  inicio: number,
  fim: number,
  primeira?: number | null,
): DiaSemana[] {
  const de = primeira != null ? Math.max(inicio, primeira) : inicio;
  const dias = new Array(7).fill(0);
  const noites = new Array(7).fill(0);
  const receita = new Array(7).fill(0);
  for (let d = de; d < fim; d++) dias[diaDaSemana(d)] += 1;
  for (const r of reservas) {
    const a = Math.max(r.ci, de);
    const b = Math.min(r.co, fim);
    for (let d = a; d < b; d++) {
      const s = diaDaSemana(d);
      noites[s] += 1;
      receita[s] += r.diariaMedia;
    }
  }
  return ORDEM_SEMANA.map((s) => ({
    rotulo: NOMES_SEMANA[s],
    ocupacao: dias[s] > 0 ? Math.min(1, noites[s] / dias[s]) : 0,
    diariaMedia: noites[s] > 0 ? receita[s] / noites[s] : 0,
    noites: noites[s],
    dias: dias[s],
    // Noites de sexta e sábado
    fimDeSemana: s === 5 || s === 6,
  }));
}

export interface FaixaAntecedencia {
  rotulo: string;
  reservas: number;
  parte: number;
}

const FAIXAS: { rotulo: string; ate: number }[] = [
  { rotulo: "Até 3 dias", ate: 3 },
  { rotulo: "4 a 14 dias", ate: 14 },
  { rotulo: "15 a 30 dias", ate: 30 },
  { rotulo: "31 a 60 dias", ate: 60 },
  { rotulo: "Mais de 60 dias", ate: Infinity },
];

export function faixasDeAntecedencia(reservas: ReservaCalculada[], inicio: number, fim: number): FaixaAntecedencia[] {
  const contagem = new Array(FAIXAS.length).fill(0);
  let total = 0;
  for (const r of reservas) {
    if (r.antecedencia == null) continue;
    if (Math.min(r.co, fim) - Math.max(r.ci, inicio) <= 0) continue;
    contagem[FAIXAS.findIndex((f) => r.antecedencia! <= f.ate)] += 1;
    total += 1;
  }
  return FAIXAS.map((f, i) => ({ rotulo: f.rotulo, reservas: contagem[i], parte: total > 0 ? contagem[i] / total : 0 }));
}

// DDD → estado
const DDD_UF: Record<string, string> = {};
const porUf: Record<string, number[]> = {
  SP: [11, 12, 13, 14, 15, 16, 17, 18, 19],
  RJ: [21, 22, 24],
  ES: [27, 28],
  MG: [31, 32, 33, 34, 35, 37, 38],
  PR: [41, 42, 43, 44, 45, 46],
  SC: [47, 48, 49],
  RS: [51, 53, 54, 55],
  DF: [61],
  GO: [62, 64],
  TO: [63],
  MT: [65, 66],
  MS: [67],
  AC: [68],
  RO: [69],
  BA: [71, 73, 74, 75, 77],
  SE: [79],
  PE: [81, 87],
  AL: [82],
  PB: [83],
  RN: [84],
  CE: [85, 88],
  PI: [86, 89],
  PA: [91, 93, 94],
  AM: [92, 97],
  RR: [95],
  AP: [96],
  MA: [98, 99],
};
for (const [uf, ddds] of Object.entries(porUf)) for (const d of ddds) DDD_UF[String(d)] = uf;

const NOME_UF: Record<string, string> = {
  SP: "São Paulo", RJ: "Rio de Janeiro", ES: "Espírito Santo", MG: "Minas Gerais", PR: "Paraná",
  SC: "Santa Catarina", RS: "Rio Grande do Sul", DF: "Distrito Federal", GO: "Goiás", TO: "Tocantins",
  MT: "Mato Grosso", MS: "Mato Grosso do Sul", AC: "Acre", RO: "Rondônia", BA: "Bahia", SE: "Sergipe",
  PE: "Pernambuco", AL: "Alagoas", PB: "Paraíba", RN: "Rio Grande do Norte", CE: "Ceará", PI: "Piauí",
  PA: "Pará", AM: "Amazonas", RR: "Roraima", AP: "Amapá", MA: "Maranhão",
};

const PAISES: Record<string, string> = {
  "+54": "Argentina", "+56": "Chile", "+57": "Colômbia", "+52": "México", "+51": "Peru",
  "+34": "Espanha", "+33": "França", "+39": "Itália", "+44": "Reino Unido", "+49": "Alemanha",
};

export function nomeDaOrigem(origem: string): string {
  if (origem.startsWith("BR-")) {
    const uf = DDD_UF[origem.slice(3)];
    return uf ? NOME_UF[uf] : "Brasil (outros)";
  }
  if (origem.startsWith("+1")) return "EUA / Canadá";
  return PAISES[origem] ?? "Outros países";
}

export interface Origem {
  rotulo: string;
  reservas: number;
  parte: number;
}

/** De onde vêm os hóspedes (estado pelo DDD, ou país). Só reservas com telefone informado. */
export function origensDosHospedes(
  reservas: ReservaCalculada[],
  inicio: number,
  fim: number,
  maximo = 5,
): { lista: Origem[]; conhecidas: number } {
  const contagem = new Map<string, number>();
  let conhecidas = 0;
  for (const r of reservas) {
    if (!r.origem) continue;
    if (Math.min(r.co, fim) - Math.max(r.ci, inicio) <= 0) continue;
    const nome = nomeDaOrigem(r.origem);
    contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
    conhecidas += 1;
  }
  const ordenada = [...contagem.entries()].sort((a, b) => b[1] - a[1]);
  const topo = ordenada.slice(0, maximo);
  const resto = ordenada.slice(maximo).reduce((s, [, n]) => s + n, 0);
  const lista = topo.map(([rotulo, n]) => ({ rotulo, reservas: n, parte: n / conhecidas }));
  if (resto > 0) lista.push({ rotulo: "Outros", reservas: resto, parte: resto / conhecidas });
  return { lista, conhecidas };
}

// ===== Agora e a seguir =====

export interface Adiante {
  emCasa: ReservaCalculada | null;
  proxima: ReservaCalculada | null;
  /** Ocupação já garantida nos próximos N dias */
  janelas: { dias: number; noites: number; ocupacao: number }[];
  /** Diárias de hoje em diante, já reservadas */
  receitaReservada: number;
  reservasFuturas: number;
  noitesLivres30: number;
  /** Maior sequência de noites livres nos próximos 30 dias */
  maiorJanelaLivre: { inicio: number; noites: number } | null;
}

export function olharAdiante(reservas: ReservaCalculada[], hoje: number): Adiante {
  const emCasa = reservas.find((r) => r.ci <= hoje && hoje < r.co) ?? null;
  const futuras = reservas.filter((r) => r.ci > hoje || (r.ci === hoje && r !== emCasa));
  const proxima = futuras.slice().sort((a, b) => a.ci - b.ci)[0] ?? null;

  const ocupadas = new Set<number>();
  let receitaReservada = 0;
  for (const r of reservas) {
    const a = Math.max(r.ci, hoje);
    if (r.co <= a) continue;
    receitaReservada += r.diarias * ((r.co - a) / r.noites);
    for (let d = a; d < Math.min(r.co, hoje + 90); d++) ocupadas.add(d);
  }

  const janelas = [30, 60, 90].map((dias) => {
    let noites = 0;
    for (let d = hoje; d < hoje + dias; d++) if (ocupadas.has(d)) noites += 1;
    return { dias, noites, ocupacao: noites / dias };
  });

  let maior: { inicio: number; noites: number } | null = null;
  let inicioAtual: number | null = null;
  for (let d = hoje; d <= hoje + 30; d++) {
    const livre = d < hoje + 30 && !ocupadas.has(d);
    if (livre && inicioAtual == null) inicioAtual = d;
    if (!livre && inicioAtual != null) {
      const n = d - inicioAtual;
      if (!maior || n > maior.noites) maior = { inicio: inicioAtual, noites: n };
      inicioAtual = null;
    }
  }

  return {
    emCasa,
    proxima,
    janelas,
    receitaReservada,
    reservasFuturas: reservas.filter((r) => r.ci >= hoje).length,
    noitesLivres30: 30 - janelas[0].noites,
    maiorJanelaLivre: maior,
  };
}

// ===== Destaques (frases prontas, calculadas — sem IA) =====

export interface Destaque {
  id: string;
  tom: "success" | "info" | "warning" | "primary" | "secondary";
  titulo: string;
  texto: string;
}

export function gerarDestaques(args: {
  reservas: ReservaCalculada[];
  periodo: Periodo;
  atual: Metricas;
  serie: MesSerie[];
  referencia: ReferenciaMes[];
  adiante: Adiante;
  primeira: number | null;
}): Destaque[] {
  const { reservas, periodo, atual, serie, referencia, adiante, primeira } = args;
  const destaques: Destaque[] = [];

  // Melhor mês já fechado
  const fechados = serie.filter((m) => !m.futuro && !m.atual && m.realizado > 0);
  if (fechados.length >= 2) {
    const melhor = fechados.reduce((a, b) => (b.realizado > a.realizado ? b : a));
    destaques.push({
      id: "melhor-mes",
      tom: "success",
      titulo: `Melhor mês: ${nomeDoMes(melhor.ano, melhor.mes0, false)}`,
      texto: `${reais(melhor.realizado)} em diárias, com ${melhor.ocupacao != null ? pct(melhor.ocupacao) : "—"} de ocupação.`,
    });
  }

  // Contra a carteira RIOS
  const rios = ocupacaoRiosNoPeriodo(referencia, periodo.inicio, periodo.fim);
  if (rios != null && atual.disponiveis >= 14) {
    const pontos = Math.round((atual.ocupacao - rios) * 100);
    if (Math.abs(pontos) >= 3) {
      destaques.push({
        id: "vs-rios",
        tom: pontos > 0 ? "success" : "info",
        titulo: pontos > 0 ? "Acima da média RIOS" : "Abaixo da média RIOS",
        texto: `Ocupação de ${pct(atual.ocupacao)} no período, ${Math.abs(pontos)} ${Math.abs(pontos) === 1 ? "ponto" : "pontos"} ${pontos > 0 ? "acima" : "abaixo"} da média da carteira (${pct(rios)}).`,
      });
    }
  }

  // Fim de semana × meio de semana
  const semana = ocupacaoPorDiaDaSemana(reservas, periodo.inicio, periodo.fim, primeira);
  const fds = semana.filter((d) => d.fimDeSemana);
  const uteis = semana.filter((d) => !d.fimDeSemana);
  const soma = (l: DiaSemana[], k: "noites" | "dias") => l.reduce((s, d) => s + d[k], 0);
  if (soma(fds, "dias") >= 4 && soma(uteis, "dias") >= 10) {
    const oFds = soma(fds, "noites") / soma(fds, "dias");
    const oUteis = soma(uteis, "noites") / soma(uteis, "dias");
    if (oFds - oUteis >= 0.15) {
      destaques.push({
        id: "fds",
        tom: "primary",
        titulo: "Fins de semana puxam a ocupação",
        texto: `Sextas e sábados ficam ${pct(oFds)} ocupados; de domingo a quinta, ${pct(oUteis)}.`,
      });
    } else if (oUteis - oFds >= 0.1) {
      destaques.push({
        id: "fds",
        tom: "primary",
        titulo: "Semana mais forte que o fim de semana",
        texto: `De domingo a quinta a ocupação é de ${pct(oUteis)}; às sextas e sábados, ${pct(oFds)}.`,
      });
    }
  }

  // Antecedência
  if (atual.antecedenciaMedia != null && atual.reservas >= 3) {
    const dias = Math.round(atual.antecedenciaMedia);
    destaques.push({
      id: "antecedencia",
      tom: "info",
      titulo: `Reservas com ${dias} ${dias === 1 ? "dia" : "dias"} de antecedência`,
      texto:
        dias <= 10
          ? "A maioria das reservas chega perto da data: noites livres ainda costumam ser preenchidas na última hora."
          : "Os hóspedes planejam com folga: datas distantes já começam a ser reservadas agora.",
    });
  }

  // De onde vêm
  const { lista, conhecidas } = origensDosHospedes(reservas, periodo.inicio, periodo.fim, 1);
  if (conhecidas >= 4 && lista[0]) {
    destaques.push({
      id: "origem",
      tom: "primary",
      titulo: `${pct(lista[0].parte)} dos hóspedes vêm de ${lista[0].rotulo}`,
      texto: `Com base em ${conhecidas} reservas do período em que o hóspede informou telefone.`,
    });
  }

  // Noites livres adiante
  if (adiante.noitesLivres30 > 0 && adiante.maiorJanelaLivre && adiante.maiorJanelaLivre.noites >= 4) {
    const j = adiante.maiorJanelaLivre;
    destaques.push({
      id: "livres",
      tom: "warning",
      titulo: `${adiante.noitesLivres30} noites livres nos próximos 30 dias`,
      texto: `A maior janela tem ${j.noites} noites, a partir de ${formatarDiaExtenso(j.inicio)}.`,
    });
  } else if (adiante.janelas[0].ocupacao >= 0.8) {
    destaques.push({
      id: "livres",
      tom: "success",
      titulo: "Próximos 30 dias quase lotados",
      texto: `${pct(adiante.janelas[0].ocupacao)} das noites já estão reservadas.`,
    });
  }

  return destaques;
}

// ===== Situação da reserva =====

export function situacaoDaReserva(r: ReservaCalculada, hoje: number): { rotulo: string; tom: "success" | "info" | "neutral" } {
  if (r.ci <= hoje && hoje < r.co) return { rotulo: "Hospedado agora", tom: "success" };
  if (r.ci > hoje) return { rotulo: "Confirmada", tom: "info" };
  return { rotulo: "Concluída", tom: "neutral" };
}
