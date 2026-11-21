import type { ReservaCalculada } from "@/lib/resultadosImovel";

/**
 * Quem se hospedou no período: adultos, crianças, bebês e pets, somados das
 * reservas. Só contagem: nenhum nome, telefone ou documento passa por aqui
 * (a consulta nem devolve isso ao proprietário).
 */
export interface PerfilDosHospedes {
  /** Reservas que tocam o período */
  reservas: number;
  /** Reservas que informam quantos adultos e crianças vieram (as da Hostex) */
  comDetalhe: number;
  /** Total de pessoas: adultos + crianças + bebês */
  pessoas: number;
  adultos: number;
  criancas: number;
  bebes: number;
  pets: number;
  /** Pessoas de reservas que só informam o total (sem separar adulto de criança) */
  semDivisao: number;
  /** Reservas com criança ou bebê */
  comCrianca: number;
  comPet: number;
  grupoMedio: number | null;
  maiorGrupo: number;
  /** Reservas sem número de hóspedes (as que vêm dos relatórios financeiros) */
  semInformacao: number;
}

export function perfilDosHospedes(reservas: ReservaCalculada[], inicio: number, fim: number): PerfilDosHospedes {
  const p: PerfilDosHospedes = {
    reservas: 0,
    comDetalhe: 0,
    pessoas: 0,
    adultos: 0,
    criancas: 0,
    bebes: 0,
    pets: 0,
    semDivisao: 0,
    comCrianca: 0,
    comPet: 0,
    grupoMedio: null,
    maiorGrupo: 0,
    semInformacao: 0,
  };
  let grupos = 0;
  let somaGrupos = 0;

  for (const r of reservas) {
    if (Math.min(r.co, fim) - Math.max(r.ci, inicio) <= 0) continue;
    p.reservas += 1;
    const temDetalhe = r.adultos != null;
    let grupo: number | null = null;
    if (temDetalhe) {
      const adultos = r.adultos ?? 0;
      const criancas = r.criancas ?? 0;
      const bebes = r.bebes ?? 0;
      const pets = r.pets ?? 0;
      p.comDetalhe += 1;
      p.adultos += adultos;
      p.criancas += criancas;
      p.bebes += bebes;
      p.pets += pets;
      if (criancas + bebes > 0) p.comCrianca += 1;
      if (pets > 0) p.comPet += 1;
      grupo = adultos + criancas + bebes;
      // reserva antiga pode trazer o total e nenhum adulto: vale o total
      if (grupo === 0 && r.hospedes) {
        grupo = r.hospedes;
        p.semDivisao += grupo;
      }
    } else if (r.hospedes) {
      grupo = r.hospedes;
      p.semDivisao += grupo;
    } else {
      p.semInformacao += 1;
    }
    if (grupo != null && grupo > 0) {
      p.pessoas += grupo;
      grupos += 1;
      somaGrupos += grupo;
      p.maiorGrupo = Math.max(p.maiorGrupo, grupo);
    }
  }

  p.grupoMedio = grupos > 0 ? somaGrupos / grupos : null;
  return p;
}
