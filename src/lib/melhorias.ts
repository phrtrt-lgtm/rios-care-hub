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
 * - o que o imóvel já tem, cômodo a cômodo: lido das fichas .md por `scripts/fichas/itens_das_fichas.py` e
 *   guardado em `properties.melhorias_ficha` (sim/não por item, o modelo de maquete e o número de quartos);
 * - as diárias do imóvel nos últimos 12 meses fechados: é em cima delas que o ganho vira reais;
 * - a faixa de ganho e de custo de cada melhoria: fica AQUI, em `MELHORIAS`. São estimativas
 *   conservadoras, e a página mostra ao lado de cada número de onde ele vem. Mudou a referência, muda-se aqui;
 * - as comparações da carteira e o perfil dos hóspedes: calculados pelo banco a cada consulta.
 *
 * Nada aqui é promessa de receita, e a página diz isso.
 */

/** Quartos numerados: o plano mostra até o terceiro (é o que as maquetes têm). */
export const MAX_QUARTOS = 3;

export type MelhoriaId = string;

export type ModeloMaquete = "apto1" | "apto2" | "apto3" | "cobertura" | "casa_terrea" | "casa_duplex";
export const MODELOS: ModeloMaquete[] = ["apto1", "apto2", "apto3", "cobertura", "casa_terrea", "casa_duplex"];

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
  /** Qual maquete representa o imóvel. Sem ficha lida, o apartamento de 2 quartos. */
  modelo: ModeloMaquete | null;
  quartos: number | null;
  capacidade: number | null;
  /** O que consta na ficha, por item. `null` = o imóvel ainda não teve a ficha lida. */
  tem: Record<string, boolean | null> | null;
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
    itens: Record<string, ParDaCarteira>;
    /** Quantos imóveis da carteira têm cada melhoria (ausente = nenhum). */
    tem?: Record<string, number>;
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

export type GrupoMelhoria = "quartos" | "sala" | "cozinha" | "banheiro" | "externa" | "geral";
export const GRUPOS: { id: GrupoMelhoria; nome: string }[] = [
  { id: "quartos", nome: "Quartos" },
  { id: "sala", nome: "Sala" },
  { id: "cozinha", nome: "Cozinha e área de serviço" },
  { id: "banheiro", nome: "Banheiro" },
  { id: "externa", nome: "Varanda e área externa" },
  { id: "geral", nome: "O imóvel todo" },
];

export interface Melhoria {
  id: MelhoriaId;
  nome: string;
  /** Nome curto, para etiqueta e marcador da maquete. */
  curto: string;
  grupo: GrupoMelhoria;
  /** Ícone (nome usado pela página). */
  icone: "ar" | "tv" | "cortina" | "mesa" | "secador" | "lavadora" | "ferro" | "loucas" | "agua" | "cafe" | "sofa" | "pet" | "chave" | "decor" | "varanda" | "sol" | "rede" | "ducha" | "fogo";
  oQueE: string;
  /** Investimento estimado, em reais. */
  custo: [number, number];
  custoNota: string;
  /** Ganho estimado sobre as diárias do ano (fração). `null` = sem estimativa de receita. */
  ganho: [number, number] | null;
  /** Ganho quando o imóvel já tem a versão mais simples (lava e seca em quem já tem máquina de lavar). */
  ganhoSeJaTem?: { item: MelhoriaId; ganho: [number, number] };
  /** Não entra junto com este outro item (ocupam o mesmo lugar). */
  noLugarDe?: MelhoriaId;
  /** De onde vem a faixa de ganho, em uma frase. */
  origem?: string;
}

const ESTUDO_AR = "Estudo do Banco de México com anúncios de praia: ar-condicionado aparece ligado a diária 14% maior no imóvel inteiro. Um cômodo é uma parte disso.";

function doQuarto(n: number): Melhoria[] {
  return [
    {
      id: `ar_q${n}`,
      nome: `Ar-condicionado no quarto ${n}`,
      curto: `Ar · quarto ${n}`,
      grupo: "quartos",
      icone: "ar",
      oQueE: `Um split inverter no quarto ${n}. Quarto sem ar é o que mais pesa na avaliação de quem viaja no verão.`,
      custo: [2400, 3800],
      custoNota: "aparelho de 9 a 12 mil BTUs, instalado",
      ganho: [0.03, 0.06],
      origem: ESTUDO_AR,
    },
    {
      id: `tv_q${n}`,
      nome: `Smart TV no quarto ${n}`,
      curto: `TV · quarto ${n}`,
      grupo: "quartos",
      icone: "tv",
      oQueE: `Uma smart TV de 32 polegadas na parede do quarto ${n}.`,
      custo: [1100, 1700],
      custoNota: "TV de 32 polegadas com suporte, instalada",
      ganho: [0.005, 0.01],
      origem: "No mesmo estudo, TV aparece ligada a diária 2% maior no imóvel inteiro, sem firmeza estatística. A faixa por quarto é uma parte disso.",
    },
  ];
}

/** A ordem é a da lista dentro de cada grupo. */
export const MELHORIAS: Melhoria[] = [
  ...[1, 2, 3].flatMap(doQuarto),
  {
    id: "blackout", nome: "Cortina blackout nos quartos", curto: "Blackout", grupo: "quartos", icone: "cortina",
    oQueE: "Cortina que escurece o quarto de verdade. Faz diferença para quem viaja com criança e para quem dorme até mais tarde.",
    custo: [500, 1800], custoNota: "cortina com varão, por quarto de R$ 250 a R$ 600", ganho: null,
  },
  {
    id: "mesa_trabalho", nome: "Mesa de trabalho", curto: "Mesa de trabalho", grupo: "quartos", icone: "mesa",
    oQueE: "Mesa com cadeira para quem trabalha de onde está. Ajuda a vender estadias longas fora da temporada.",
    custo: [500, 1200], custoNota: "mesa e cadeira de escritório", ganho: null,
  },
  {
    id: "ar_sala", nome: "Ar-condicionado na sala", curto: "Ar · sala", grupo: "sala", icone: "ar",
    oQueE: "Um split inverter na sala, para o imóvel inteiro ficar fresco no verão, e não só os quartos.",
    custo: [3000, 4800], custoNota: "aparelho de 12 a 18 mil BTUs, instalado", ganho: [0.03, 0.07], origem: ESTUDO_AR,
  },
  {
    id: "tv_sala", nome: "Smart TV na sala", curto: "TV · sala", grupo: "sala", icone: "tv",
    oQueE: "Uma smart TV grande na sala, com os aplicativos de filme e série.",
    custo: [1800, 3200], custoNota: "TV de 50 polegadas com suporte, instalada", ganho: [0.01, 0.02],
    origem: "No mesmo estudo, TV aparece ligada a diária 2% maior, sem firmeza estatística.",
  },
  {
    id: "sofa_cama", nome: "Sofá-cama na sala", curto: "Sofá-cama", grupo: "sala", icone: "sofa",
    oQueE: "Trocar o sofá por um sofá-cama de casal. O imóvel passa a receber mais duas pessoas.",
    custo: [1800, 3500], custoNota: "sofá-cama de casal", ganho: [0.01, 0.04],
    origem: "Vem das reservas que lotam o imóvel. Na carteira, quem tem cama extra não rende mais: é a faixa mais fraca desta lista.",
  },
  {
    id: "lavadora", nome: "Máquina de lavar", curto: "Máquina de lavar", grupo: "cozinha", icone: "lavadora",
    oQueE: "Uma máquina de lavar roupa na área de serviço. Pesa para famílias e para quem fica uma semana ou mais.",
    custo: [1800, 2800], custoNota: "máquina de 10 a 12 kg, instalada", ganho: [0.02, 0.04], noLugarDe: "lava_seca",
    origem: "Estudo do Banco de México com anúncios de praia: máquina de lavar aparece ligada a diária 6% maior.",
  },
  {
    id: "lava_seca", nome: "Lava e seca", curto: "Lava e seca", grupo: "cozinha", icone: "lavadora",
    oQueE: "Uma máquina que lava e seca. Na praia, roupa que seca no mesmo dia vale muito.",
    custo: [3200, 4800], custoNota: "máquina de 10 a 11 kg, instalada", ganho: [0.03, 0.06], noLugarDe: "lavadora",
    ganhoSeJaTem: { item: "lavadora", ganho: [0.01, 0.02] },
    origem: "No mesmo estudo: máquina de lavar ligada a diária 6% maior e secadora, a 8%.",
  },
  {
    id: "lava_loucas", nome: "Lava-louças", curto: "Lava-louças", grupo: "cozinha", icone: "loucas",
    oQueE: "Uma lava-louças embutida na bancada. Quase nenhum imóvel da região tem.",
    custo: [2200, 3500], custoNota: "lava-louças de 8 serviços, instalada", ganho: null,
  },
  {
    id: "purificador", nome: "Purificador de água", curto: "Purificador", grupo: "cozinha", icone: "agua",
    oQueE: "Água gelada e filtrada na cozinha, sem o hóspede precisar comprar galão.",
    custo: [400, 900], custoNota: "purificador de parede, instalado", ganho: null,
  },
  {
    id: "cafeteira", nome: "Cafeteira de cápsula", curto: "Cafeteira", grupo: "cozinha", icone: "cafe",
    oQueE: "Uma cafeteira de cápsulas no balcão. Aparece bem nas fotos do anúncio.",
    custo: [350, 600], custoNota: "cafeteira de cápsulas", ganho: null,
  },
  {
    id: "ferro", nome: "Ferro e tábua de passar", curto: "Ferro e tábua", grupo: "cozinha", icone: "ferro",
    oQueE: "Ferro de passar e tábua na área de serviço.",
    custo: [200, 400], custoNota: "ferro a vapor e tábua", ganho: null,
  },
  {
    id: "secador", nome: "Secador de cabelo", curto: "Secador", grupo: "banheiro", icone: "secador",
    oQueE: "Um secador de cabelo no banheiro. É item de filtro no Airbnb e custa pouco.",
    custo: [120, 250], custoNota: "secador de cabelo", ganho: null,
  },
  {
    id: "varanda", nome: "Mobília na varanda", curto: "Mobília externa", grupo: "externa", icone: "varanda",
    oQueE: "Mesa e cadeiras para usar a varanda de verdade: café da manhã e fim de tarde.",
    custo: [600, 1800], custoNota: "mesa e cadeiras para área externa", ganho: null,
  },
  {
    id: "espreguicadeiras", nome: "Espreguiçadeiras", curto: "Espreguiçadeiras", grupo: "externa", icone: "sol",
    oQueE: "Duas espreguiçadeiras na área externa.",
    custo: [600, 1600], custoNota: "duas espreguiçadeiras", ganho: null,
  },
  {
    id: "rede", nome: "Rede", curto: "Rede", grupo: "externa", icone: "rede",
    oQueE: "Uma rede de descanso na varanda. É a foto que todo anúncio de praia quer ter.",
    custo: [250, 700], custoNota: "rede com suporte ou ganchos instalados", ganho: null,
  },
  {
    id: "ducha", nome: "Ducha externa", curto: "Ducha", grupo: "externa", icone: "ducha",
    oQueE: "Uma ducha na área externa, para tirar a areia antes de entrar.",
    custo: [400, 1200], custoNota: "ducha com piso e instalação", ganho: null,
  },
  {
    id: "churrasqueira", nome: "Churrasqueira", curto: "Churrasqueira", grupo: "externa", icone: "fogo",
    oQueE: "Churrasqueira com bancada na área externa. Grupo grande procura por ela.",
    custo: [1500, 4500], custoNota: "da elétrica de bancada à de alvenaria", ganho: null,
  },
  {
    id: "decoracao", nome: "Decoração de curadoria", curto: "Decoração", grupo: "geral", icone: "decor",
    oQueE: "Quadros, tapete, almofadas, plantas e luz. A curadoria da RIOS escolhe peça por peça e monta no imóvel.",
    custo: [1400, 5200], custoNota: "faixa das propostas de curadoria da RIOS em 2026", ganho: [0.04, 0.1],
    origem: "Não achamos estudo controlado sobre decoração. A estimativa é uma parte da diferença medida na carteira.",
  },
  {
    id: "pet", nome: "Aceitar pet", curto: "Pet", grupo: "geral", icone: "pet",
    oQueE: "Liberar pet no anúncio, com caminha, potes e capa no sofá. A taxa pet cobre a limpeza a mais.",
    custo: [150, 400], custoNota: "caminha, potes e capa de sofá", ganho: [0.02, 0.04],
  },
  {
    id: "fechadura", nome: "Fechadura digital", curto: "Fechadura", grupo: "geral", icone: "chave",
    oQueE: "Entrada por senha: o hóspede chega a qualquer hora, sem depender de chave.",
    custo: [700, 1500], custoNota: "fechadura com teclado, instalada", ganho: null,
  },
];

export const MELHORIA_POR_ID: Record<MelhoriaId, Melhoria> = Object.fromEntries(MELHORIAS.map((m) => [m.id, m]));

/** Estudo usado como referência externa (lido na fonte em 2026-11-22). */
export const ESTUDO_BANXICO = {
  titulo: "The changing valuation of short-term rental amenities in Mexico during and after the COVID-19 pandemic",
  autores: "López-Ley, Mayorga, Molina e Pérez Pérez",
  onde: "Banco de México, Documento de Investigación 2026-03",
  url: "https://www.banxico.org.mx/publications-and-press/banco-de-mexico-working-papers/%7B7FC490DD-986D-0736-20BB-19DD5BD4F332%7D.pdf",
};

// ===== O que vale para este imóvel =====

export type Situacao = "tem" | "falta" | "sem_ficha";

export function situacaoDe(dados: MelhoriasImovel | undefined, id: MelhoriaId): Situacao {
  if (!dados?.tem) return "sem_ficha";
  // quem tem lava e seca tem máquina de lavar
  if (id === "lavadora" && dados.tem.lava_seca === true) return "tem";
  return dados.tem[id] === true ? "tem" : "falta";
}

/**
 * As melhorias que fazem sentido para o imóvel: as que a maquete do modelo dele tem (apartamento não tem
 * churrasqueira nem ducha) e, nos quartos, só os que o imóvel tem de fato.
 */
export function melhoriasDoImovel(dados: MelhoriasImovel | undefined, naMaquete: string[]): Melhoria[] {
  const quartos = Math.min(MAX_QUARTOS, dados?.quartos && dados.quartos > 0 ? dados.quartos : MAX_QUARTOS);
  return MELHORIAS.filter((m) => {
    if (!naMaquete.includes(m.id)) return false;
    const q = /_q(\d)$/.exec(m.id);
    return !q || Number(q[1]) <= quartos;
  });
}

/** A faixa de ganho que vale para este imóvel (a lava e seca rende menos em quem já tem máquina de lavar). */
export function ganhoDe(m: Melhoria, dados: MelhoriasImovel | undefined): [number, number] | null {
  if (m.ganhoSeJaTem && dados && situacaoDe(dados, m.ganhoSeJaTem.item) === "tem") return m.ganhoSeJaTem.ganho;
  return m.ganho;
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
export function ganhoDoItem(m: Melhoria, base: BaseDaConta, dados?: MelhoriasImovel): Faixa | null {
  const g = ganhoDe(m, dados);
  if (!g || !base.temHistorico) return null;
  return { min: base.diarias * g[0] * base.fatorLiquido, max: base.diarias * g[1] * base.fatorLiquido };
}

export function retornoDoItem(m: Melhoria, base: BaseDaConta, dados?: MelhoriasImovel): Faixa | null {
  const g = ganhoDoItem(m, base, dados);
  if (!g || g.max <= 0) return null;
  return { min: (m.custo[0] * 100) / (g.max / 12), max: (m.custo[1] * 100) / (g.min / 12) };
}

export function contaDoPlano(ids: MelhoriaId[], base: BaseDaConta, dados?: MelhoriasImovel): ContaDoPlano {
  const investimento = { min: 0, max: 0 };
  let sobraMin = 1;
  let sobraMax = 1;
  let comGanho = false;
  for (const id of ids) {
    const m = MELHORIA_POR_ID[id];
    if (!m) continue;
    investimento.min += m.custo[0] * 100;
    investimento.max += m.custo[1] * 100;
    const g = ganhoDe(m, dados);
    if (g) {
      comGanho = true;
      sobraMin *= 1 - g[0];
      sobraMax *= 1 - g[1];
    }
  }
  const fracao = comGanho ? { min: 1 - sobraMin, max: 1 - sobraMax } : null;
  const ganhoAno = fracao && base.temHistorico ? { min: base.diarias * fracao.min * base.fatorLiquido, max: base.diarias * fracao.max * base.fatorLiquido } : null;
  const retornoMeses =
    ganhoAno && ganhoAno.min > 0 ? { min: investimento.min / (ganhoAno.max / 12), max: investimento.max / (ganhoAno.min / 12) } : null;
  return { itens: ids, investimento, fracao, ganhoAno, retornoMeses };
}

/**
 * O plano sugerido: só as melhorias que faltam e têm estimativa de receita, da que se paga mais rápido para a
 * mais lenta. Entre máquina de lavar e lava e seca, entra a lava e seca.
 */
export function planoSugerido(dados: MelhoriasImovel, disponiveis: Melhoria[]): MelhoriaId[] {
  const peso = (m: Melhoria) => {
    const g = ganhoDe(m, dados)!;
    return (m.custo[0] + m.custo[1]) / (g[0] + g[1]);
  };
  return disponiveis
    .filter((m) => situacaoDe(dados, m.id) !== "tem" && ganhoDe(m, dados) && m.id !== "lavadora")
    .sort((a, b) => peso(a) - peso(b))
    .map((m) => m.id);
}

/** Ao ligar um item, o que ocupa o mesmo lugar sai da simulação. */
export function alternarNaSimulacao(atual: MelhoriaId[], id: MelhoriaId): MelhoriaId[] {
  if (atual.includes(id)) return atual.filter((x) => x !== id);
  const fora = MELHORIA_POR_ID[id]?.noLugarDe;
  return [...atual.filter((x) => x !== fora), id];
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
  const n = (v: number) => (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return `${n(a)}% a ${n(b)}%`;
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

/** O comentário do Paulo quando a melhoria entra na simulação: o dado que mais pesa, em uma frase. */
export function comentarioDe(id: MelhoriaId, dados: MelhoriasImovel): string {
  const h = dados.hospedes;
  const m = MELHORIA_POR_ID[id];
  if (id.startsWith("ar_q")) return "Quarto fresco é o que o hóspede mais cobra no verão.";
  if (id.startsWith("tv_q")) return "TV no quarto conta ponto com família grande.";
  switch (id) {
    case "ar_sala":
      return "Sala fresca no verão. É onde o grupo inteiro se junta.";
    case "lavadora":
    case "lava_seca":
      return "Quem fica uma semana agradece, e a diária acompanha.";
    case "decoracao":
      return "É o que mais muda as fotos do anúncio.";
    case "sofa_cama":
      return h?.lotam != null ? `${pct(h.lotam)} das reservas lotam o imóvel. Com o sofá-cama, cabem mais duas pessoas.` : "Com o sofá-cama, cabem mais duas pessoas.";
    case "pet":
      return h?.com_pet_onde_aceita != null ? `Onde pode, ${pct(h.com_pet_onde_aceita)} das reservas trazem pet.` : "Quem viaja com pet só procura onde pode.";
    case "fechadura":
      return "Chegada a qualquer hora, sem chave para perder.";
    default:
      return m?.ganho ? "Entrou na conta." : "Não muda a diária na nossa conta, mas o hóspede nota e lembra na avaliação.";
  }
}

/** De onde vem a estimativa de cada melhoria, em frases curtas com o número ao lado. */
export function evidencias(id: MelhoriaId, dados: MelhoriasImovel): Evidencia[] {
  const saida: Evidencia[] = [];
  const m = MELHORIA_POR_ID[id];
  const par = dados.carteira.itens[id];
  const h = dados.hospedes;
  const meu = dados.do_imovel && dados.do_imovel.reservas >= 15 ? dados.do_imovel : null;

  if (id === "sofa_cama" && h?.grupo_medio != null) {
    let texto = `O grupo médio é de ${h.grupo_medio.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} pessoas`;
    if (h.lotam != null) texto += `, e ${pct(h.lotam)} das reservas lotam o imóvel em que ficam`;
    texto += ".";
    if (meu?.lotam != null && dados.capacidade) texto += ` Neste imóvel, para ${dados.capacidade} pessoas, ${pct(meu.lotam)} lotaram.`;
    saida.push({ origem: "hospedes", texto });
  }
  if (id === "pet" && h?.com_pet_onde_aceita != null) {
    saida.push({ origem: "hospedes", texto: `Nos imóveis da RIOS que aceitam pet, ${pct(h.com_pet_onde_aceita)} das reservas trazem um. Quem não aceita fica fora dessas buscas.` });
  }
  if (par) {
    const dif = par.sem.por_dia_cents > 0 ? par.com.por_dia_cents / par.sem.por_dia_cents - 1 : 0;
    const leitura =
      dif >= 0.03
        ? `Por dia do calendário, renderam ${pct(dif)} a mais.`
        : dif <= -0.03
          ? "Por dia do calendário, não renderam mais: aqui pesam outros fatores, como tamanho e localização."
          : "Por dia do calendário, renderam parecido.";
    saida.push({
      origem: "carteira",
      texto: `Na carteira da RIOS, os ${par.com.n} imóveis que têm ocuparam ${pct(par.com.ocupacao)} das noites, com diária de ${reais(par.com.diaria_cents)}; os ${par.sem.n} que não têm, ${pct(par.sem.ocupacao)} e ${reais(par.sem.diaria_cents)}. ${leitura}`,
    });
  } else {
    const n = dados.carteira.tem?.[id];
    if (n != null && dados.carteira.imoveis >= 10) {
      saida.push({ origem: "carteira", texto: `${n} dos ${dados.carteira.imoveis} imóveis da carteira têm. Com tão poucos de um lado, não dá para comparar.` });
    }
  }
  if (m?.origem) saida.push({ origem: "estudo", texto: m.origem });
  if (m && !m.ganho) saida.push({ origem: "nota", texto: "Sem estimativa de receita: não achamos estudo nem diferença na carteira que mostre ganho. Entra pelo conforto do hóspede e pelas avaliações." });
  return saida;
}

function linhasDoPlano(conta: ContaDoPlano): string[] {
  return conta.itens.filter((id) => MELHORIA_POR_ID[id]).map((id) => `- ${MELHORIA_POR_ID[id].nome}: investimento de ${faixaDeCusto(MELHORIA_POR_ID[id])}`);
}

/** O plano em texto, para mandar a outra pessoa (quem decide junto, por exemplo). */
export function textoParaCompartilhar(dados: MelhoriasImovel, conta: ContaDoPlano): string {
  const linhas = [`Plano de melhorias do imóvel ${dados.imovel.nome} (estimativa da RIOS Hospedagens)`, "", ...linhasDoPlano(conta), "", `Investimento no total: ${faixaEmReais(conta.investimento)}`];
  if (conta.ganhoAno) linhas.push(`A mais por ano: ${faixaEmReais(conta.ganhoAno)}`);
  if (conta.retornoMeses) linhas.push(`O investimento volta ${faixaDeRetorno(conta.retornoMeses)}`);
  linhas.push("", "É estimativa, feita com os dados dos imóveis que a RIOS administra. Não é garantia de receita.");
  return linhas.join("\n");
}

/** O texto que vai no chamado quando o proprietário pede as melhorias. */
export function mensagemDoPedido(dados: MelhoriasImovel, conta: ContaDoPlano): { assunto: string; mensagem: string } {
  const nomes = conta.itens.filter((id) => MELHORIA_POR_ID[id]).map((id) => MELHORIA_POR_ID[id].nome);
  const linhas = [
    `Olá! Montei um plano de melhorias para o imóvel ${dados.imovel.nome} na página de resultados e quero conversar sobre ele.`,
    "",
    "O que escolhi:",
    ...linhasDoPlano(conta),
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
