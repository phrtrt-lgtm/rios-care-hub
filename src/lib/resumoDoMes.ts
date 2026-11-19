import {
  deDia,
  diaDaSemana,
  diaDe,
  infoCanal,
  liquidoEstimado,
  metricas,
  nomeDoMes,
  ocupacaoMercadoNoPeriodo,
  ocupacaoPorDiaDaSemana,
  ocupacaoRiosNoPeriodo,
  olharAdiante,
  origensPorEstado,
  pct,
  variacao,
  type Adiante,
  type OrigensPorEstado,
  type ReservaCalculada,
  type ResultadoImovel,
} from "@/lib/resultadosImovel";

/**
 * Resumo do mês de um imóvel: os números que a história ("Resumo de outubro")
 * mostra, calculados das mesmas reservas e com as mesmas definições da página
 * de resultados. Nada aqui vai ao banco.
 *
 * Só existe resumo de mês fechado: mês em andamento mistura noite que já
 * aconteceu com noite reservada, e a história é sobre o que aconteceu.
 */

export interface MesRef {
  ano: number;
  mes0: number;
  /** "aaaa-mm" */
  chave: string;
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function chaveDoMes(ano: number, mes0: number): string {
  return `${ano}-${String(mes0 + 1).padStart(2, "0")}`;
}

function mesRelativo(hoje: number, delta: number): MesRef & { inicio: number; fim: number } {
  const d = deDia(hoje);
  const base = new Date(d.getFullYear(), d.getMonth() + delta, 1);
  const ano = base.getFullYear();
  const mes0 = base.getMonth();
  return { ano, mes0, chave: chaveDoMes(ano, mes0), inicio: diaDe(ano, mes0), fim: diaDe(ano, mes0 + 1) };
}

/** Meses fechados com ao menos uma noite reservada, do mais recente para o mais antigo. */
export function mesesComResumo(reservas: ReservaCalculada[], hoje: number, primeira: number | null, maximo = 12): MesRef[] {
  const lista: MesRef[] = [];
  for (let i = 1; i <= 24 && lista.length < maximo; i++) {
    const m = mesRelativo(hoje, -i);
    if (primeira != null && m.fim <= primeira) break;
    if (reservas.some((r) => Math.min(r.co, m.fim) - Math.max(r.ci, m.inicio) > 0)) {
      lista.push({ ano: m.ano, mes0: m.mes0, chave: m.chave });
    }
  }
  return lista;
}

export interface DiaDoResumo {
  dia: number;
  numero: number;
  reservada: boolean;
  /** Cor do canal da reserva que ocupa a noite */
  cor: string | null;
  /** Antes da primeira reserva conhecida do imóvel: não conta como noite vazia */
  semHistorico: boolean;
}

export interface MesAdiante {
  chave: string;
  nome: string;
  atual: boolean;
  /** Diárias do mês inteiro: o que já aconteceu mais o que já está reservado */
  receita: number;
  noites: number;
  dias: number;
}

export interface ResumoMes {
  mes: MesRef & { nome: string; nomeComAno: string };
  noites: number;
  disponiveis: number;
  ocupacao: number;
  receita: number;
  diariaMedia: number;
  reservas: number;
  /** null quando não há % de comissão para estimar */
  liquido: number | null;
  /** Soma dos hóspedes das reservas do mês; null se nenhuma informa */
  hospedes: number | null;
  estadiaMedia: number;
  antecedenciaMedia: number | null;
  dias: DiaDoResumo[];
  /** Dia da semana do dia 1 (0 = domingo), para alinhar a grade */
  primeiroDiaDaSemana: number;
  anterior: { nome: string; receita: number; ocupacao: number } | null;
  variacaoReceita: number | null;
  /** Diferença de ocupação para o mês anterior, em fração (0,12 = 12 pontos) */
  variacaoOcupacao: number | null;
  /** Até seis meses terminando neste, para as barras */
  serie: { chave: string; rotulo: string; receita: number; atual: boolean }[];
  /** Melhor mês em diárias desde o começo do histórico (com pelo menos três meses) */
  recorde: boolean;
  comparacao: { rios: number | null; mercado: number | null };
  origens: OrigensPorEstado;
  curiosidades: string[];
  adiante: Adiante;
  proximosMeses: MesAdiante[];
}

export function montarResumo(
  dados: ResultadoImovel,
  reservas: ReservaCalculada[],
  mes: MesRef,
  hoje: number,
  primeira: number | null,
): ResumoMes {
  const inicio = diaDe(mes.ano, mes.mes0);
  const fim = diaDe(mes.ano, mes.mes0 + 1);
  const m = metricas(reservas, inicio, fim, primeira);
  const doMes = reservas.filter((r) => Math.min(r.co, fim) - Math.max(r.ci, inicio) > 0);

  // Noite a noite
  const porNoite = new Map<number, ReservaCalculada>();
  for (const r of doMes) {
    for (let d = Math.max(r.ci, inicio); d < Math.min(r.co, fim); d++) porNoite.set(d, r);
  }
  const dias: DiaDoResumo[] = Array.from({ length: fim - inicio }, (_, i) => {
    const dia = inicio + i;
    const r = porNoite.get(dia);
    return {
      dia,
      numero: i + 1,
      reservada: !!r,
      cor: r ? infoCanal(r.canal).cor : null,
      semHistorico: primeira != null && dia < primeira,
    };
  });

  // Hóspedes
  const comHospedes = doMes.filter((r) => (r.hospedes ?? 0) > 0);
  const hospedes = comHospedes.length > 0 ? comHospedes.reduce((s, r) => s + (r.hospedes ?? 0), 0) : null;

  // Mês anterior
  const pInicio = diaDe(mes.ano, mes.mes0 - 1);
  const ma = metricas(reservas, pInicio, inicio, primeira);
  const temAnterior = ma.disponiveis >= 14;
  const dAnterior = deDia(pInicio);
  const anterior = temAnterior
    ? { nome: nomeDoMes(dAnterior.getFullYear(), dAnterior.getMonth(), false), receita: ma.receita, ocupacao: ma.ocupacao }
    : null;

  // Série e recorde: todo o histórico fechado até este mês (no máximo 24 meses)
  const historico: { chave: string; rotulo: string; receita: number; atual: boolean }[] = [];
  for (let i = 23; i >= 0; i--) {
    const base = new Date(mes.ano, mes.mes0 - i, 1);
    const a = base.getFullYear();
    const m0 = base.getMonth();
    const ini = diaDe(a, m0);
    const f = diaDe(a, m0 + 1);
    if (primeira != null && f <= primeira) continue;
    const t = metricas(reservas, ini, f, primeira);
    if (t.disponiveis <= 0) continue;
    historico.push({ chave: chaveDoMes(a, m0), rotulo: MESES_CURTOS[m0], receita: t.receita, atual: i === 0 });
  }
  const recorde =
    historico.length >= 3 && m.receita > 0 && historico.every((h) => h.atual || h.receita < m.receita);

  // Curiosidades: só o que os dados sustentam
  const curiosidades: string[] = [];
  if (doMes.length >= 2) {
    const maisLonga = Math.max(...doMes.map((r) => r.noites));
    if (maisLonga >= 3) curiosidades.push(`A estadia mais longa teve ${maisLonga} noites`);
  }
  const semana = ocupacaoPorDiaDaSemana(reservas, inicio, fim, primeira).filter((d) => d.fimDeSemana);
  const diasFds = semana.reduce((s, d) => s + d.dias, 0);
  if (diasFds >= 4) {
    const noitesFds = semana.reduce((s, d) => s + d.noites, 0);
    curiosidades.push(`Sextas e sábados: ${pct(noitesFds / diasFds)} ocupados`);
  }
  if (m.antecedenciaMedia != null && m.reservas >= 2) {
    const dias = Math.round(m.antecedenciaMedia);
    curiosidades.push(`Reservas feitas ${dias} ${dias === 1 ? "dia" : "dias"} antes, em média`);
  }
  if (comHospedes.length >= 2) {
    const maior = Math.max(...comHospedes.map((r) => r.hospedes ?? 0));
    if (maior >= 3) curiosidades.push(`O maior grupo teve ${maior} hóspedes`);
  }

  // Daqui para frente: mês atual e os dois seguintes
  const proximosMeses: MesAdiante[] = [0, 1, 2]
    .map((i) => {
      const p = mesRelativo(hoje, i);
      const t = metricas(reservas, p.inicio, p.fim, primeira);
      return { chave: p.chave, nome: nomeDoMes(p.ano, p.mes0, false), atual: i === 0, receita: t.receita, noites: t.noites, dias: p.fim - p.inicio };
    })
    .filter((p) => p.atual || p.noites > 0);

  return {
    mes: { ...mes, nome: nomeDoMes(mes.ano, mes.mes0, false), nomeComAno: nomeDoMes(mes.ano, mes.mes0) },
    noites: m.noites,
    disponiveis: m.disponiveis,
    ocupacao: m.ocupacao,
    receita: m.receita,
    diariaMedia: m.diariaMedia,
    reservas: m.reservas,
    liquido: liquidoEstimado(m.base, dados.comissao_pct),
    hospedes,
    estadiaMedia: m.estadiaMedia,
    antecedenciaMedia: m.antecedenciaMedia,
    dias,
    primeiroDiaDaSemana: diaDaSemana(inicio),
    anterior,
    variacaoReceita: anterior ? variacao(m.receita, anterior.receita) : null,
    variacaoOcupacao: anterior ? m.ocupacao - anterior.ocupacao : null,
    serie: historico.slice(-6),
    recorde,
    comparacao: {
      rios: ocupacaoRiosNoPeriodo(dados.referencia, inicio, fim),
      mercado: ocupacaoMercadoNoPeriodo(dados.mercado ?? [], inicio, fim),
    },
    origens: origensPorEstado(reservas, inicio, fim),
    curiosidades,
    adiante: olharAdiante(reservas, hoje),
    proximosMeses,
  };
}

// ===== "Já vi": o anel da miniatura apaga depois que a pessoa abre o resumo =====

const CHAVE_VISTO = "rios:resumo-visto";

function lerVistos(): Record<string, string> {
  try {
    const bruto = localStorage.getItem(CHAVE_VISTO);
    const valor = bruto ? JSON.parse(bruto) : {};
    return valor && typeof valor === "object" ? (valor as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** A pessoa já abriu o resumo deste mês (ou de um mais novo) neste aparelho? */
export function resumoJaVisto(imovelId: string, chave: string): boolean {
  const visto = lerVistos()[imovelId];
  return typeof visto === "string" && visto >= chave;
}

export function marcarResumoVisto(imovelId: string, chave: string): void {
  try {
    const vistos = lerVistos();
    if (typeof vistos[imovelId] === "string" && vistos[imovelId] >= chave) return;
    vistos[imovelId] = chave;
    localStorage.setItem(CHAVE_VISTO, JSON.stringify(vistos));
  } catch {
    // Sem armazenamento (aba anônima): o anel só não apaga.
  }
}
