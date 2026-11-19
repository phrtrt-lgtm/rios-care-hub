import { diaDaSemana, type ReservaCalculada } from "@/lib/resultadosImovel";

/**
 * Dados do "ano em relevo": uma linha por mês, uma coluna por dia do mês. Cada
 * noite reservada vira um bloco, com a altura pelo valor da diária daquela
 * reserva. Sem three.js aqui: é só a conta, a cena fica em `relevoCena.ts`.
 */

export interface MesDoRelevo {
  chave: string;
  ano: number;
  mes0: number;
  rotulo: string;
  /** Primeiro dia do mês (número do dia) */
  inicio: number;
  /** Primeiro dia do mês seguinte */
  fim: number;
  /** Da linha do tempo da página, para o recorde de "mês mais cheio" */
  ocupacao?: number | null;
  futuro?: boolean;
  atual?: boolean;
}

export interface PisoDoRelevo {
  dia: number;
  linha: number;
  coluna: number;
  /** Noite de sexta ou de sábado */
  fimDeSemana: boolean;
}

export interface NoiteDoRelevo extends PisoDoRelevo {
  /** Índice em `reservas` */
  reserva: number;
  /** De hoje em diante: já reservada, ainda não aconteceu */
  futura: boolean;
}

export interface ModeloRelevo {
  meses: MesDoRelevo[];
  /** Todo dia que existe na janela, a partir do começo do histórico */
  pisos: PisoDoRelevo[];
  noites: NoiteDoRelevo[];
  /** Só as reservas que aparecem na janela */
  reservas: ReservaCalculada[];
  /** Maior diária média entre elas, em centavos (≥ 1) */
  maiorDiaria: number;
  hoje: { linha: number; coluna: number } | null;
  /** Para a descrição lida por leitor de tela */
  noitesPassadas: number;
  noitesFuturas: number;
}

export function montarRelevo(reservas: ReservaCalculada[], meses: MesDoRelevo[], hoje: number, primeira: number | null): ModeloRelevo {
  const inicio = meses.length > 0 ? meses[0].inicio : 0;
  const fim = meses.length > 0 ? meses[meses.length - 1].fim : 0;

  const usadas: ReservaCalculada[] = [];
  const reservaDoDia = new Map<number, number>();
  for (const r of reservas) {
    const de = Math.max(r.ci, inicio);
    const ate = Math.min(r.co, fim);
    if (ate <= de) continue;
    const indice = usadas.push(r) - 1;
    for (let dia = de; dia < ate; dia++) reservaDoDia.set(dia, indice);
  }

  const pisos: PisoDoRelevo[] = [];
  const noites: NoiteDoRelevo[] = [];
  let marcaHoje: ModeloRelevo["hoje"] = null;
  let noitesPassadas = 0;
  let noitesFuturas = 0;

  meses.forEach((mes, linha) => {
    for (let dia = mes.inicio; dia < mes.fim; dia++) {
      const coluna = dia - mes.inicio;
      if (dia === hoje) marcaHoje = { linha, coluna };
      // antes da primeira reserva o imóvel ainda não estava no ar: sem piso, o relevo começa ali
      if (primeira != null && dia < primeira) continue;
      const semana = diaDaSemana(dia);
      const celula: PisoDoRelevo = { dia, linha, coluna, fimDeSemana: semana === 5 || semana === 6 };
      pisos.push(celula);
      const reserva = reservaDoDia.get(dia);
      if (reserva == null) continue;
      const futura = dia >= hoje;
      noites.push({ ...celula, reserva, futura });
      if (futura) noitesFuturas += 1;
      else noitesPassadas += 1;
    }
  });

  return {
    meses,
    pisos,
    noites,
    reservas: usadas,
    maiorDiaria: Math.max(1, ...usadas.map((r) => r.diariaMedia)),
    hoje: marcaHoje,
    noitesPassadas,
    noitesFuturas,
  };
}
