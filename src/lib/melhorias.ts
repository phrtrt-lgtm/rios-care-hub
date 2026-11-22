import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { pct, reais } from "@/lib/resultadosImovel";

// melhorias_imovel ainda não está no types.ts gerado (mesmo padrão de resultadosImovel.ts).
const db = supabase as unknown as SupabaseClient;

/**
 * Plano de melhorias do imóvel (aba "Melhorias" da página de resultados).
 *
 * O que entra na conta, e de onde vem:
 * - o que o imóvel já tem: lido da ficha do imóvel pelo banco (`melhorias_imovel`), em sim/não;
 * - as diárias do imóvel nos últimos 12 meses fechados: é em cima delas que o ganho vira reais;
 * - a faixa de ganho e de custo de cada melhoria: fica AQUI, em `MELHORIAS`. São estimativas
 *   conservadoras (uma parte da diferença medida na carteira da RIOS e em estudos publicados), e a
 *   página mostra ao lado de cada número de onde ele vem. Mudou a referência, muda-se aqui;
 * - as comparações da carteira e o perfil dos hóspedes: calculados pelo banco a cada consulta.
 *
 * Nada aqui é promessa de receita, e a página diz isso.
 */

export type MelhoriaId = "ar_sala" | "lavadora" | "decoracao" | "familia" | "camas" | "pet" | "praia" | "fechadura";

export interface LadoDaCarteira {
  n: number;
  ocupacao: number;
  diaria_cents: number;
  por_dia_cents: number;
  no_topo: number;
}

export interface ParDaCarteira {
  com: LadoDaCarteira;
  sem: LadoDaCarteira;
}

export interface PerfilDeHospedes {
  reservas: number;
  com_bebe: number | null;
  com_crianca_ou_bebe: number | null;
  com_pet: number | null;
  com_pet_onde_aceita: number | null;
  grupo_medio: number | null;
  grupo_7_ou_mais: number | null;
  lotam: number | null;
}

export interface MelhoriasImovel {
  imovel: { id: string; nome: string };
  periodo: { de: string; ate: string };
  /** O que consta na ficha. `null` = o imóvel não tem ficha no portal. */
  tem: (Partial<Record<MelhoriaId, boolean | null>> & { capacidade?: number | null }) | null;
  base: {
    noites: number;
    dias: number;
    diarias_cents: number;
    taxa_canal_cents: number;
    reservas: number;
    comissao_pct: number | null;
  };
  carteira: {
    imoveis: number;
    itens: Partial<Record<MelhoriaId, ParDaCarteira>>;
    /** Quantos imóveis da carteira têm cada melhoria (ausente = nenhum). */
    tem?: Partial<Record<MelhoriaId, number>>;
  };
  hospedes: PerfilDeHospedes | null;
  do_imovel: PerfilDeHospedes | null;
}

export function consultaMelhorias(propertyId: string | undefined) {
  return {
    queryKey: ["melhorias-imovel", propertyId] as const,
    enabled: !!propertyId,
    // muda devagar (ficha e 12 meses fechados): uma consulta por visita basta
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<MelhoriasImovel> => {
      const { data, error } = await db.rpc("melhorias_imovel", { p_property_id: propertyId });
      if (error) throw error;
      return data as MelhoriasImovel;
    },
  };
}

export function useMelhorias(propertyId: string | undefined, ativo = true) {
  const opcoes = consultaMelhorias(propertyId);
  return useQuery({ ...opcoes, enabled: opcoes.enabled && ativo });
}

// ===== Catálogo =====

export interface Melhoria {
  id: MelhoriaId;
  nome: string;
  /** Nome curto, para etiqueta e marcador da maquete. */
  curto: string;
  oQueE: string;
  /** Cômodo que a maquete enquadra ao escolher a melhoria (`null` = o apartamento todo). */
  comodo: string | null;
  /** Investimento estimado, em reais. */
  custo: [number, number];
  custoNota: string;
  /** Ganho estimado sobre as diárias do ano (fração). `null` = sem estimativa de receita. */
  ganho: [number, number] | null;
  /** Quando o imóvel já tem. */
  jaTem: string;
}

/** A ordem é a da lista quando não há dados para ordenar. */
export const MELHORIAS: Melhoria[] = [
  {
    id: "ar_sala",
    nome: "Ar-condicionado na sala",
    curto: "Ar na sala",
    oQueE: "Um split inverter na sala, para o apartamento inteiro ficar fresco no verão, e não só os quartos.",
    comodo: "sala",
    custo: [3000, 4800],
    custoNota: "aparelho de 12 a 18 mil BTUs, instalado",
    ganho: [0.03, 0.07],
    jaTem: "A sala já é climatizada.",
  },
  {
    id: "lavadora",
    nome: "Lava e seca",
    curto: "Lava e seca",
    oQueE: "Uma máquina que lava e seca na área de serviço. Pesa para famílias e para quem fica uma semana ou mais.",
    comodo: "servico",
    custo: [2800, 4800],
    custoNota: "máquina de 10 a 11 kg, instalada",
    ganho: [0.02, 0.05],
    jaTem: "O imóvel já tem máquina de lavar.",
  },
  {
    id: "decoracao",
    nome: "Decoração de curadoria",
    curto: "Decoração",
    oQueE: "Quadros, tapete, almofadas, plantas e luz. A curadoria da RIOS escolhe peça por peça e monta no imóvel.",
    comodo: null,
    custo: [1400, 5200],
    custoNota: "faixa das propostas de curadoria da RIOS em 2026",
    ganho: [0.04, 0.1],
    jaTem: "O imóvel já está no padrão alto de decoração.",
  },
  {
    id: "familia",
    nome: "Kit família",
    curto: "Kit família",
    oQueE: "Berço e cadeirão para quem viaja com bebê. Vira filtro de busca no Airbnb.",
    comodo: "quarto1",
    custo: [500, 900],
    custoNota: "berço desmontável e cadeirão",
    ganho: [0.01, 0.03],
    jaTem: "O imóvel já tem berço ou cadeirão.",
  },
  {
    id: "camas",
    nome: "Mais lugares para dormir",
    curto: "Mais camas",
    oQueE: "Uma cama auxiliar (bicama) ou um sofá-cama, para o grupo inteiro caber.",
    comodo: "quarto2",
    custo: [900, 2800],
    custoNota: "bicama com colchão ou sofá-cama",
    // a comparação da carteira não mostra ganho (imóvel maior precisa menos de cama extra): faixa mais baixa
    ganho: [0.01, 0.04],
    jaTem: "O imóvel já tem cama extra (sofá-cama, bicama ou beliche).",
  },
  {
    id: "pet",
    nome: "Aceitar pet",
    curto: "Pet",
    oQueE: "Liberar pet no anúncio, com caminha, potes e capa no sofá. A taxa pet cobre a limpeza a mais.",
    comodo: "sala",
    custo: [150, 400],
    custoNota: "caminha, potes e capa de sofá",
    ganho: [0.02, 0.04],
    jaTem: "O imóvel já aceita pet.",
  },
  {
    id: "praia",
    nome: "Kit praia",
    curto: "Kit praia",
    oQueE: "Cadeiras, guarda-sol, caixa térmica e carrinho para levar à praia.",
    comodo: "varanda",
    custo: [400, 900],
    custoNota: "quatro cadeiras, guarda-sol, caixa térmica e carrinho",
    ganho: null,
    jaTem: "O imóvel já tem itens de praia.",
  },
  {
    id: "fechadura",
    nome: "Fechadura digital",
    curto: "Fechadura",
    oQueE: "Entrada por senha: o hóspede chega a qualquer hora, sem depender de chave.",
    comodo: "entrada",
    custo: [700, 1500],
    custoNota: "fechadura com teclado, instalada",
    ganho: null,
    jaTem: "A entrada já é por fechadura digital.",
  },
];

export const MELHORIA_POR_ID = Object.fromEntries(MELHORIAS.map((m) => [m.id, m])) as Record<MelhoriaId, Melhoria>;

/** Estudo usado como referência externa (lido na fonte em 2026-11-22). */
export const ESTUDO_BANXICO = {
  titulo: "The changing valuation of short-term rental amenities in Mexico during and after the COVID-19 pandemic",
  autores: "López-Ley, Mayorga, Molina e Pérez Pérez",
  onde: "Banco de México, Documento de Investigación 2026-03",
  url: "https://www.banxico.org.mx/publications-and-press/banco-de-mexico-working-papers/%7B7FC490DD-986D-0736-20BB-19DD5BD4F332%7D.pdf",
};

// ===== Situação de cada melhoria no imóvel =====

export type Situacao = "tem" | "falta" | "sem_ficha";

export function situacaoDe(dados: MelhoriasImovel | undefined, id: MelhoriaId): Situacao {
  if (!dados?.tem) return "sem_ficha";
  return dados.tem[id] === true ? "tem" : "falta";
}

// ===== A conta =====

export interface BaseDaConta {
  /** Diárias do imóvel nos 12 meses (centavos). */
  diarias: number;
  /** Quanto de cada real de diária chega ao proprietário, depois do canal e da comissão. */
  fatorLiquido: number;
  /** A comissão entrou no fator? Sem ela, a estimativa é "antes da comissão". */
  comComissao: boolean;
  /** Há histórico suficiente para falar em reais? */
  temHistorico: boolean;
  ocupacao: number;
}

export function baseDaConta(dados: MelhoriasImovel): BaseDaConta {
  const { diarias_cents: diarias, taxa_canal_cents: taxa, noites, dias, comissao_pct: comissao } = dados.base;
  const parteDoCanal = diarias > 0 ? Math.min(0.4, Math.max(0, taxa / diarias)) : 0;
  const comComissao = comissao != null && comissao > 0 && comissao < 100;
  return {
    diarias,
    fatorLiquido: (1 - parteDoCanal) * (comComissao ? 1 - comissao! / 100 : 1),
    comComissao,
    temHistorico: diarias > 0 && noites >= 45,
    ocupacao: dias > 0 ? noites / dias : 0,
  };
}

export interface Faixa {
  min: number;
  max: number;
}

export interface ContaDoPlano {
  itens: MelhoriaId[];
  /** Investimento, em centavos. */
  investimento: Faixa;
  /** Ganho sobre as diárias, em fração (já combinado: os ganhos não se somam por inteiro). */
  fracao: Faixa | null;
  /** A mais por ano para o proprietário, em centavos. `null` sem histórico ou sem item com estimativa. */
  ganhoAno: Faixa | null;
  /** Em quantos meses o investimento volta. `null` quando não há ganho estimado. */
  retornoMeses: Faixa | null;
}

/** Ganho de um item sozinho, em centavos por ano para o proprietário. */
export function ganhoDoItem(m: Melhoria, base: BaseDaConta): Faixa | null {
  if (!m.ganho || !base.temHistorico) return null;
  return { min: base.diarias * m.ganho[0] * base.fatorLiquido, max: base.diarias * m.ganho[1] * base.fatorLiquido };
}

export function retornoDoItem(m: Melhoria, base: BaseDaConta): Faixa | null {
  const g = ganhoDoItem(m, base);
  if (!g || g.max <= 0) return null;
  return { min: (m.custo[0] * 100) / (g.max / 12), max: (m.custo[1] * 100) / (g.min / 12) };
}

export function contaDoPlano(ids: MelhoriaId[], base: BaseDaConta): ContaDoPlano {
  const itens = ids.map((id) => MELHORIA_POR_ID[id]);
  const investimento = { min: 0, max: 0 };
  let sobraMin = 1;
  let sobraMax = 1;
  let comGanho = false;
  for (const m of itens) {
    investimento.min += m.custo[0] * 100;
    investimento.max += m.custo[1] * 100;
    if (m.ganho) {
      comGanho = true;
      sobraMin *= 1 - m.ganho[0];
      sobraMax *= 1 - m.ganho[1];
    }
  }
  const fracao = comGanho ? { min: 1 - sobraMin, max: 1 - sobraMax } : null;
  const ganhoAno = fracao && base.temHistorico ? { min: base.diarias * fracao.min * base.fatorLiquido, max: base.diarias * fracao.max * base.fatorLiquido } : null;
  const retornoMeses =
    ganhoAno && ganhoAno.min > 0 ? { min: investimento.min / (ganhoAno.max / 12), max: investimento.max / (ganhoAno.min / 12) } : null;
  return { itens: ids, investimento, fracao, ganhoAno, retornoMeses };
}

/**
 * Ordem sugerida das melhorias que faltam: primeiro as que se pagam mais rápido (custo no meio da
 * faixa sobre ganho no meio da faixa); as que não têm estimativa de receita ficam no fim.
 */
export function ordemSugerida(dados: MelhoriasImovel): MelhoriaId[] {
  const faltam = MELHORIAS.filter((m) => situacaoDe(dados, m.id) !== "tem");
  const peso = (m: Melhoria) => (m.ganho ? (m.custo[0] + m.custo[1]) / (m.ganho[0] + m.ganho[1]) : Number.POSITIVE_INFINITY);
  return [...faltam].sort((a, b) => peso(a) - peso(b)).map((m) => m.id);
}

// ===== Textos =====

/** "R$ 1,2 mil a R$ 3,4 mil" (arredonda para a centena: é estimativa). */
export function faixaEmReais(f: Faixa): string {
  const redondo = (cents: number) => {
    const v = cents / 100;
    const passo = v >= 10_000 ? 500 : v >= 1_000 ? 100 : 50;
    return Math.max(passo, Math.round(v / passo) * passo) * 100;
  };
  const a = redondo(f.min);
  const b = redondo(f.max);
  return a === b ? reais(a) : `${reais(a)} a ${reais(b)}`;
}

export function faixaDeCusto(m: Melhoria): string {
  return `${reais(m.custo[0] * 100)} a ${reais(m.custo[1] * 100)}`;
}

export function faixaEmPct(f: Faixa | [number, number]): string {
  const [a, b] = Array.isArray(f) ? f : [f.min, f.max];
  return `${Math.round(a * 100)}% a ${Math.round(b * 100)}%`;
}

/** "em 4 a 9 meses", "em 1 a 2 anos", "em mais de 5 anos". */
export function faixaDeRetorno(f: Faixa): string {
  const a = Math.max(1, Math.round(f.min));
  const b = Math.max(a, Math.round(f.max));
  if (a > 60) return "em mais de 5 anos";
  const emAnos = (meses: number) => (meses / 12).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (b > 60) return a >= 24 ? `em ${emAnos(a)} anos ou mais` : `em ${a} meses ou mais`;
  if (a >= 24) return `em ${emAnos(a)} a ${emAnos(b)} anos`;
  if (b > 24) return `em ${a} meses a ${emAnos(b)} anos`;
  return a === b ? `em ${a} ${a === 1 ? "mês" : "meses"}` : `em ${a} a ${b} meses`;
}

export interface Evidencia {
  origem: "carteira" | "hospedes" | "estudo" | "nota";
  texto: string;
}

const ROTULO_COM: Record<MelhoriaId, [string, string]> = {
  ar_sala: ["com ar na sala", "sem ar na sala"],
  lavadora: ["com máquina de lavar", "sem máquina de lavar"],
  decoracao: ["de padrão alto", "de padrão conforto"],
  familia: ["com berço ou cadeirão", "sem berço nem cadeirão"],
  camas: ["com cama extra", "sem cama extra"],
  pet: ["que aceitam pet", "que não aceitam pet"],
  praia: ["com itens de praia", "sem itens de praia"],
  fechadura: ["com fechadura digital", "sem fechadura digital"],
};

/** Quantos imóveis da carteira têm a melhoria, quando são poucos (até 15%). `null` = não é raro, ou não se sabe. */
function poucosTem(dados: MelhoriasImovel, id: MelhoriaId): number | null {
  if (!dados.carteira.tem || dados.carteira.imoveis < 10) return null;
  const n = dados.carteira.tem[id] ?? 0;
  return n <= dados.carteira.imoveis * 0.15 ? n : null;
}

/** O comentário do Paulo quando a melhoria entra na simulação: o dado que mais pesa, em uma frase. */
export function comentarioDe(id: MelhoriaId, dados: MelhoriasImovel): string {
  const h = dados.hospedes;
  switch (id) {
    case "ar_sala":
      return "Sala fresca no verão. É onde o grupo inteiro se junta.";
    case "lavadora":
      return "Quem fica uma semana agradece, e a diária acompanha.";
    case "decoracao":
      return "É o que mais muda as fotos do anúncio.";
    case "familia":
      return h?.com_crianca_ou_bebe != null
        ? `${pct(h.com_crianca_ou_bebe)} das reservas trazem criança ou bebê${poucosTem(dados, "familia") != null ? ", e berço quase ninguém tem" : ""}.`
        : "Quem viaja com bebê procura por berço.";
    case "camas":
      return h?.lotam != null ? `${pct(h.lotam)} das reservas lotam o imóvel. Com mais uma cama, cabe mais gente.` : "Com mais uma cama, o grupo inteiro cabe.";
    case "pet":
      return h?.com_pet_onde_aceita != null ? `Onde pode, ${pct(h.com_pet_onde_aceita)} das reservas trazem pet.` : "Quem viaja com pet só procura onde pode.";
    case "praia":
      return "Não muda a diária, mas o hóspede lembra na avaliação.";
    case "fechadura":
      return "Chegada a qualquer hora, sem chave para perder.";
  }
}

/** De onde vem a estimativa de cada melhoria, em frases curtas com o número ao lado. */
export function evidencias(id: MelhoriaId, dados: MelhoriasImovel): Evidencia[] {
  const saida: Evidencia[] = [];
  const par = dados.carteira.itens[id];
  const h = dados.hospedes;
  const meu = dados.do_imovel && dados.do_imovel.reservas >= 15 ? dados.do_imovel : null;

  if (id === "familia" && h?.com_crianca_ou_bebe != null) {
    let texto = `${pct(h.com_crianca_ou_bebe)} das reservas da RIOS trazem criança ou bebê`;
    if (h.com_bebe != null) texto += `, e ${pct(h.com_bebe)} trazem bebê`;
    texto += ".";
    if (meu?.com_crianca_ou_bebe != null) texto += ` Neste imóvel, ${pct(meu.com_crianca_ou_bebe)} vieram com criança ou bebê.`;
    saida.push({ origem: "hospedes", texto });
    const raro = poucosTem(dados, "familia");
    if (raro != null) {
      saida.push({
        origem: "carteira",
        texto: `${raro === 0 ? "Nenhum" : `Só ${raro}`} dos ${dados.carteira.imoveis} imóveis da carteira ${raro === 1 ? "tem" : "têm"} berço ou cadeirão na ficha. Berço é filtro de busca no Airbnb.`,
      });
    }
  }
  if (id === "camas" && h?.grupo_medio != null) {
    let texto = `O grupo médio é de ${h.grupo_medio.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} pessoas`;
    if (h.grupo_7_ou_mais != null) texto += `, e ${pct(h.grupo_7_ou_mais)} das reservas têm 7 ou mais`;
    texto += ".";
    if (h.lotam != null) texto += ` ${pct(h.lotam)} das reservas lotam o imóvel em que ficam.`;
    saida.push({ origem: "hospedes", texto });
    if (meu?.lotam != null && dados.tem?.capacidade) {
      saida.push({ origem: "hospedes", texto: `Neste imóvel, para ${dados.tem.capacidade} pessoas, ${pct(meu.lotam)} das reservas lotaram.` });
    }
  }
  if (id === "pet" && h?.com_pet_onde_aceita != null) {
    saida.push({ origem: "hospedes", texto: `Nos imóveis da RIOS que aceitam pet, ${pct(h.com_pet_onde_aceita)} das reservas trazem um. Quem não aceita fica fora dessas buscas.` });
  }

  if (par) {
    const [rotuloCom, rotuloSem] = ROTULO_COM[id];
    const dif = par.sem.por_dia_cents > 0 ? par.com.por_dia_cents / par.sem.por_dia_cents - 1 : 0;
    const leitura =
      dif >= 0.03
        ? `Por dia do calendário, renderam ${pct(dif)} a mais.`
        : dif <= -0.03
          ? "Por dia do calendário, não renderam mais: aqui pesam outros fatores, como tamanho e localização."
          : "Por dia do calendário, renderam parecido.";
    saida.push({
      origem: "carteira",
      texto: `Na carteira da RIOS, os ${par.com.n} imóveis ${rotuloCom} ocuparam ${pct(par.com.ocupacao)} das noites, com diária de ${reais(par.com.diaria_cents)}; os ${par.sem.n} ${rotuloSem}, ${pct(par.sem.ocupacao)} e ${reais(par.sem.diaria_cents)}. ${leitura}`,
    });
    const topoCom = par.com.no_topo / par.com.n;
    const topoSem = par.sem.no_topo / par.sem.n;
    if (topoCom - topoSem >= 0.1) {
      saida.push({
        origem: "carteira",
        texto: `${par.com.no_topo} desses ${par.com.n} estão no terço que mais rende frente ao próprio mercado; entre os outros, ${par.sem.no_topo} de ${par.sem.n}.`,
      });
    }
  }

  if (id === "ar_sala") {
    saida.push({ origem: "estudo", texto: "Estudo do Banco de México com anúncios de praia: ar-condicionado aparece ligado a diária 14% maior. Aqui os quartos já têm; completar a sala é uma parte desse efeito." });
  }
  if (id === "lavadora") {
    saida.push({ origem: "estudo", texto: "Estudo do Banco de México com anúncios de praia: máquina de lavar aparece ligada a diária 6% maior." });
  }
  if (id === "familia") {
    saida.push({ origem: "estudo", texto: "Estudo do Banco de México com anúncios de praia: berço aparece ligado a diária 3% maior." });
  }
  if (id === "decoracao") {
    saida.push({ origem: "nota", texto: "Não achamos estudo controlado sobre decoração. A estimativa é uma parte da diferença medida na carteira." });
  }
  if (id === "praia") {
    saida.push({ origem: "nota", texto: "Não achamos estudo nem diferença na carteira que mostre ganho de receita. Entra pelo conforto do hóspede e pelas avaliações." });
  }
  if (id === "fechadura") {
    saida.push({ origem: "nota", texto: "Sem estimativa de receita: o ganho é de operação. A chegada deixa de depender de chave e de horário." });
    const n = dados.carteira.tem?.fechadura;
    if (n != null && n > 0) saida.push({ origem: "carteira", texto: `${n} dos ${dados.carteira.imoveis} imóveis da carteira já ${n === 1 ? "tem" : "têm"}.` });
  }
  return saida;
}

/** O plano em texto, para mandar a outra pessoa (quem decide junto, por exemplo). */
export function textoParaCompartilhar(dados: MelhoriasImovel, conta: ContaDoPlano): string {
  const linhas = [
    `Plano de melhorias do imóvel ${dados.imovel.nome} (estimativa da RIOS Hospedagens)`,
    "",
    ...conta.itens.map((id) => `- ${MELHORIA_POR_ID[id].nome}: investimento de ${faixaDeCusto(MELHORIA_POR_ID[id])}`),
    "",
    `Investimento no total: ${faixaEmReais(conta.investimento)}`,
  ];
  if (conta.ganhoAno) linhas.push(`A mais por ano: ${faixaEmReais(conta.ganhoAno)}`);
  if (conta.retornoMeses) linhas.push(`O investimento volta ${faixaDeRetorno(conta.retornoMeses)}`);
  linhas.push("", "É estimativa, feita com os dados dos imóveis que a RIOS administra. Não é garantia de receita.");
  return linhas.join("\n");
}

/** O texto que vai no chamado quando o proprietário pede as melhorias. */
export function mensagemDoPedido(dados: MelhoriasImovel, conta: ContaDoPlano): { assunto: string; mensagem: string } {
  const nomes = conta.itens.map((id) => MELHORIA_POR_ID[id].nome);
  const linhas = [
    `Olá! Montei um plano de melhorias para o imóvel ${dados.imovel.nome} na página de resultados e quero conversar sobre ele.`,
    "",
    "O que escolhi:",
    ...conta.itens.map((id) => `- ${MELHORIA_POR_ID[id].nome} (estimativa de investimento: ${faixaDeCusto(MELHORIA_POR_ID[id])})`),
    "",
    `Investimento estimado no total: ${faixaEmReais(conta.investimento)}.`,
  ];
  if (conta.ganhoAno) linhas.push(`Ganho estimado: ${faixaEmReais(conta.ganhoAno)} por ano.`);
  linhas.push("", "Podem me passar o orçamento e os próximos passos?");
  return {
    assunto: nomes.length === 1 ? `Melhoria no imóvel: ${nomes[0]}` : `Plano de melhorias (${nomes.length} itens)`,
    mensagem: linhas.join("\n"),
  };
}
