// Leitura do JSON de neighborhood_data da API do PriceLabs (uma listagem por
// chamada). Fica separado do index.ts para poder ser testado sem Deno.
//
// O que a resposta traz (nomes como o PriceLabs devolve):
// - "Market KPI": por categoria, meses passados (Oct 2024 … mês atual) com
//   dias disponíveis, dias reservados e receita do mercado → ocupação e
//   diária realizadas;
// - "Future Occ/New/Canc": por categoria, ocupação diária do mercado de hoje
//   em diante (on the books) e a do mesmo dia no ano anterior;
// - "Future Percentile Prices Monthly": por categoria, preço anunciado
//   mediano (50º percentil) médio de cada mês à frente.
// Categorias: "0", "1", "2"… = quartos; "-1" = listagens vizinhas (o
// conjunto comparável que o PriceLabs monta para a listagem).

export interface LinhaMercado {
  categoria: string;
  /** "aaaa-mm-01" */
  mes: string;
  ocupacao: number | null;
  ocupacao_ano_anterior: number | null;
  diaria_cents: number | null;
  preco_mediano_cents: number | null;
  listagens: number | null;
  origem: "historico" | "futuro";
}

const MESES: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** "Oct 2024" → "2024-10-01"; "2026-10" → "2026-10-01"; outros → null. */
export function mesDe(rotulo: unknown): string | null {
  if (typeof rotulo !== "string") return null;
  const iso = /^(\d{4})-(\d{2})/.exec(rotulo);
  if (iso) return `${iso[1]}-${iso[2]}-01`;
  const ingles = /^([A-Za-z]{3})\w*\s+(\d{4})$/.exec(rotulo.trim());
  if (ingles && MESES[ingles[1].toLowerCase()]) return `${ingles[2]}-${MESES[ingles[1].toLowerCase()]}-01`;
  return null;
}

/** As séries vêm ora como lista, ora como lista dentro de lista. */
function serie(y: unknown): (number | null)[] {
  let v: unknown = y;
  while (Array.isArray(v) && v.length === 1 && Array.isArray(v[0])) v = v[0];
  if (!Array.isArray(v)) return [];
  return v.map((n) => (typeof n === "number" && Number.isFinite(n) ? n : null));
}

function serieDe(bloco: any, rotulos: unknown, nome: string): (number | null)[] {
  if (!Array.isArray(rotulos)) return [];
  const i = rotulos.indexOf(nome);
  if (i < 0 || !Array.isArray(bloco?.Y_values)) return [];
  return serie(bloco.Y_values[i]);
}

function media(valores: (number | null)[]): number | null {
  const v = valores.filter((n): n is number => n != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

const arredondar = (n: number | null, casas: number) => (n == null ? null : Number(n.toFixed(casas)));

/**
 * Converte a resposta de uma listagem em linhas mensais, uma por categoria e
 * mês. `hoje` decide o que é histórico (KPI) e o que é futuro (ocupação
 * diária on the books).
 */
export function linhasDoMercado(dados: any, hoje: Date): LinhaMercado[] {
  const mesAtual = `${hoje.getUTCFullYear()}-${String(hoje.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const porChave = new Map<string, LinhaMercado>();
  const linha = (categoria: string, mes: string, origem: LinhaMercado["origem"]): LinhaMercado => {
    const chave = `${categoria}|${mes}`;
    let l = porChave.get(chave);
    if (!l) {
      l = { categoria, mes, ocupacao: null, ocupacao_ano_anterior: null, diaria_cents: null, preco_mediano_cents: null, listagens: null, origem };
      porChave.set(chave, l);
    }
    return l;
  };

  // 1) Histórico: KPI mensal (só meses já fechados)
  const kpi = dados?.["Market KPI"];
  for (const [categoria, bloco] of Object.entries<any>(kpi?.Category ?? {})) {
    const meses = Array.isArray(bloco?.X_values) ? bloco.X_values : [];
    const disponiveis = serieDe(bloco, kpi.Labels, "Total Available Days");
    const reservados = serieDe(bloco, kpi.Labels, "Total Booked Days");
    const receita = serieDe(bloco, kpi.Labels, "Revenue");
    meses.forEach((rotulo: unknown, i: number) => {
      const mes = mesDe(rotulo);
      if (!mes || mes >= mesAtual) return;
      const d = disponiveis[i];
      const r = reservados[i];
      if (!d || d <= 0 || r == null) return;
      const l = linha(categoria, mes, "historico");
      l.ocupacao = arredondar(Math.min(1, r / d), 4);
      l.diaria_cents = r > 0 && receita[i] != null ? Math.round((receita[i]! / r) * 100) : null;
      l.listagens = typeof bloco["Listings Used"] === "number" ? bloco["Listings Used"] : null;
    });
  }

  // 2) Futuro (e mês atual): média da ocupação diária do mercado por mês
  const occ = dados?.["Future Occ/New/Canc"];
  for (const [categoria, bloco] of Object.entries<any>(occ?.Category ?? {})) {
    const dias = Array.isArray(bloco?.X_values) ? bloco.X_values : [];
    const ocupacao = serieDe(bloco, occ.Labels, "Occupancy");
    const anoAnterior = serieDe(bloco, occ.Labels, "Occupancy_LY");
    const porMes = new Map<string, { o: (number | null)[]; ly: (number | null)[] }>();
    dias.forEach((dia: unknown, i: number) => {
      const mes = mesDe(dia);
      if (!mes || mes < mesAtual) return;
      const m = porMes.get(mes) ?? { o: [], ly: [] };
      m.o.push(ocupacao[i] ?? null);
      m.ly.push(anoAnterior[i] ?? null);
      porMes.set(mes, m);
    });
    for (const [mes, m] of porMes) {
      // mês com poucos dias cobertos (o último da série) não representa o mês
      if (m.o.filter((v) => v != null).length < 7) continue;
      const l = linha(categoria, mes, "futuro");
      const o = media(m.o);
      const ly = media(m.ly);
      l.ocupacao = o == null ? null : arredondar(Math.min(1, o / 100), 4);
      l.ocupacao_ano_anterior = ly == null ? null : arredondar(Math.min(1, ly / 100), 4);
      l.listagens = l.listagens ?? (typeof bloco["Listings Used"] === "number" ? bloco["Listings Used"] : null);
    }
  }

  // 3) Preço anunciado mediano por mês à frente
  const precos = dados?.["Future Percentile Prices Monthly"];
  for (const [categoria, bloco] of Object.entries<any>(precos?.Category ?? {})) {
    const meses = Array.isArray(bloco?.X_values) ? bloco.X_values : [];
    const mediana = serieDe(bloco, precos.Labels, "50th Percentile Avg");
    meses.forEach((rotulo: unknown, i: number) => {
      const mes = mesDe(rotulo);
      if (!mes || mediana[i] == null) return;
      const l = linha(categoria, mes, mes < mesAtual ? "historico" : "futuro");
      l.preco_mediano_cents = Math.round(mediana[i]! * 100);
    });
  }

  return [...porChave.values()].sort((a, b) => a.categoria.localeCompare(b.categoria) || a.mes.localeCompare(b.mes));
}

/** "20832_12673118_house" → "12673118" (id da propriedade na Hostex). */
export function idHostexDaListagem(listingId: string): string | null {
  const m = /^\d+_(\d+)_/.exec(listingId);
  return m ? m[1] : null;
}
