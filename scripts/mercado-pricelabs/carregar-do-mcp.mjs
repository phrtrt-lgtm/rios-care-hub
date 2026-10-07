#!/usr/bin/env node
// Carga manual do mercado (PriceLabs) em mercado_mensal, sem API key.
//
// O MCP do PriceLabs (get_listing_neighborhood_market, pms "hostex") devolve o
// mesmo JSON da API de neighborhood_data, mas sem dizer de qual listagem é.
// Este script lê uma pasta com essas respostas salvas, liga cada uma ao imóvel
// pelo lat/lng (imóveis no mesmo endereço compartilham o mesmo mercado), passa
// pelo mesmo parser da function pricelabs-sync e gera os upserts em partes.
//
// Uso:
//   node scripts/mercado-pricelabs/carregar-do-mcp.mjs <pasta-json> <imoveis.json> <pasta-saida> [--forcar NOME=arquivo.json]...
// Veja o README.md ao lado para o passo a passo e a SQL que gera imoveis.json.
// Precisa de Node 23.6+ (importa parse.ts direto).
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { linhasDoMercado } from "../../supabase/functions/pricelabs-sync/parse.ts";

const args = process.argv.slice(2);
const forcados = {};
const posicionais = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--forcar") {
    const [nome, arquivo] = String(args[++i]).split("=");
    forcados[nome] = arquivo;
  } else posicionais.push(args[i]);
}
const [pastaJson, arquivoImoveis, pastaSaida] = posicionais;
if (!pastaJson || !arquivoImoveis || !pastaSaida) {
  console.error("uso: carregar-do-mcp.mjs <pasta-json> <imoveis.json> <pasta-saida> [--forcar NOME=arquivo]");
  process.exit(1);
}

/** Distância máxima (em graus, ~150 m) entre o ponto do imóvel e o da resposta. */
const TOLERANCIA = 0.0015;
/** Listagens por arquivo de saída (~21 KB cada, cabe numa chamada de query). */
const POR_PARTE = 19;

// 1) respostas salvas: aceita o envelope do MCP ({data:{data:{...}}}), o da API ({data:{...}}) ou o objeto cru
const arquivos = [];
for (const nome of readdirSync(pastaJson).filter((f) => /\.(json|txt)$/i.test(f))) {
  let j;
  try {
    j = JSON.parse(readFileSync(join(pastaJson, nome), "utf-8"));
  } catch {
    continue;
  }
  const d = j?.data?.data?.["Market KPI"] ? j.data.data : j?.data?.["Market KPI"] ? j.data : j?.["Market KPI"] ? j : null;
  if (!d || typeof d.lat !== "number" || typeof d.lng !== "number") continue;
  arquivos.push({ nome, lat: d.lat, lng: d.lng, dados: d });
}
if (!arquivos.length) {
  console.error("nenhuma resposta de neighborhood_data encontrada em", pastaJson);
  process.exit(1);
}

// 2) imóveis (nome, property_id, listing_id, lat, lng, categoria)
const imoveis = JSON.parse(readFileSync(arquivoImoveis, "utf-8"));
const hoje = new Date();
const cache = new Map();
const linhasDe = (a) => {
  if (!cache.has(a.nome)) cache.set(a.nome, linhasDoMercado(a.dados, hoje));
  return cache.get(a.nome);
};
const mesMais = (m0, i) => {
  const [y, m] = m0.split("-").map(Number);
  const t = y * 12 + (m - 1) + i;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
};
const arr = (xs) => `'{${xs.map((x) => (x == null ? "NULL" : String(x))).join(",")}}'`;

// um registro por listagem × categoria: arrays por mês, desempacotados por unnest no banco
function bloco(listing, pid, categoria, linhas) {
  linhas = [...linhas].sort((a, b) => a.mes.localeCompare(b.mes));
  const m0 = linhas[0].mes;
  linhas.forEach((l, i) => {
    if (l.mes !== mesMais(m0, i)) throw new Error(`${listing}: meses não consecutivos em ${l.mes}`);
  });
  const origens = [...new Set(linhas.map((l) => l.origem))];
  if (origens.length > 2) throw new Error(`${listing}: origens ${origens}`);
  const k = linhas.findIndex((l) => l.origem !== origens[0]);
  const kk = k < 0 ? linhas.length : k;
  const hist = origens[0];
  const fut = origens[1] ?? origens[0];
  if (!linhas.slice(kk).every((l) => l.origem === fut)) throw new Error(`${listing}: origem fora de ordem`);
  return `('${listing}','${pid}','${categoria}','${m0}',${kk},'${hist}','${fut}',${arr(linhas.map((l) => l.listagens))},${arr(linhas.map((l) => l.ocupacao))},${arr(linhas.map((l) => l.ocupacao_ano_anterior))},${arr(linhas.map((l) => l.diaria_cents))},${arr(linhas.map((l) => l.preco_mediano_cents))})`;
}

const blocos = [];
const resumo = [];
const avisos = [];
const usados = new Set();
let totalLinhas = 0;
for (const im of imoveis) {
  if (!im.property_id) continue;
  if (!im.listing_id) {
    avisos.push(`${im.nome}: sem listing_id (pegue em get_listings e preencha em imoveis.json)`);
    continue;
  }
  let melhor = null;
  let dist = Infinity;
  if (forcados[im.nome]) {
    melhor = arquivos.find((a) => a.nome === forcados[im.nome]);
    if (!melhor) throw new Error(`--forcar ${im.nome}: arquivo ${forcados[im.nome]} não está na pasta`);
    dist = 0;
  } else {
    for (const a of arquivos) {
      const d = Math.hypot(a.lat - Number(im.lat), a.lng - Number(im.lng));
      if (d < dist) {
        dist = d;
        melhor = a;
      }
    }
  }
  if (!melhor || dist > TOLERANCIA) {
    avisos.push(`${im.nome}: nenhuma resposta perto (${dist.toFixed(4)}); use --forcar ${im.nome}=arquivo`);
    continue;
  }
  usados.add(melhor.nome);
  const todas = linhasDe(melhor);
  const categorias = ["-1", ...(im.categoria && im.categoria !== "-1" ? [im.categoria] : [])];
  for (const cat of categorias) {
    const linhas = todas.filter((l) => l.categoria === cat);
    if (!linhas.length) {
      avisos.push(`${im.nome}: categoria ${cat} vazia na resposta`);
      continue;
    }
    blocos.push(bloco(im.listing_id, im.property_id, cat, linhas));
    totalLinhas += linhas.length;
    const jan = linhas.find((l) => l.mes === `${hoje.getFullYear()}-01-01`);
    resumo.push(
      `${im.nome.padEnd(14)} ${im.listing_id.padEnd(22)} cat ${cat.padEnd(3)} ${melhor.nome.slice(-28).padEnd(28)} d=${dist.toFixed(5)} meses=${linhas.length} listagens=${linhas[0].listagens} jan=${jan?.ocupacao ?? "-"}`,
    );
  }
}
console.log(resumo.join("\n"));
const sobrando = arquivos.filter((a) => !usados.has(a.nome));
if (sobrando.length) {
  console.log(`\nRespostas não usadas (endereço repetido ou sem imóvel): ${sobrando.map((a) => `${a.nome} (${a.lat},${a.lng})`).join(", ")}`);
}
if (avisos.length) console.log("\nAVISOS:\n" + avisos.join("\n"));
console.log(`\n${blocos.length} registros, ${totalLinhas} linhas de mercado_mensal`);

const CABECALHO = `insert into public.mercado_mensal (listing_id, pms, property_id, categoria, mes, ocupacao, ocupacao_ano_anterior, diaria_cents, preco_mediano_cents, listagens, origem)
select l.listing, 'hostex', l.pid::uuid, l.cat, (l.m0::date + make_interval(months => (u.i - 1)::int))::date, u.oc, u.oa, u.di, u.pm, u.n, case when u.i <= l.k then l.hist else l.fut end
from (values
`;
const RODAPE = `
) as l(listing, pid, cat, m0, k, hist, fut, n, oc, oa, di, pm)
cross join lateral unnest(l.n::int[], l.oc::numeric[], l.oa::numeric[], l.di::int[], l.pm::int[]) with ordinality as u(n, oc, oa, di, pm, i)
on conflict (listing_id, categoria, mes) do update set property_id = excluded.property_id, ocupacao = excluded.ocupacao, ocupacao_ano_anterior = excluded.ocupacao_ano_anterior, diaria_cents = excluded.diaria_cents, preco_mediano_cents = excluded.preco_mediano_cents, listagens = excluded.listagens, origem = excluded.origem, synced_at = now();`;
mkdirSync(pastaSaida, { recursive: true });
for (let i = 0, p = 1; i < blocos.length; i += POR_PARTE, p++) {
  const sql = CABECALHO + blocos.slice(i, i + POR_PARTE).join(",\n") + RODAPE;
  const nome = join(pastaSaida, `mercado-${p}.sql`);
  writeFileSync(nome, sql);
  console.log(`${nome}: ${Math.min(POR_PARTE, blocos.length - i)} registros, ${sql.length} bytes`);
}
