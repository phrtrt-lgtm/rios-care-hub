// Prepara o Mini Paulo em 3D para a página de resultados do portal.
//
//   node motion/paulo-3d/empacotar.mjs
//
// Entrada: o modelo exportado do Tripo, já com o bordado oficial na textura
// (projeto do jogo, fora deste repositório). Saída: public/resultados3d/paulo.glb,
// um arquivo só, com a malha reduzida, a textura em WebP e as animações que a
// página usa, tudo comprimido (meshopt). O three.js lê com GLTFLoader + MeshoptDecoder.
//
// Usa as ferramentas instaladas no projeto do jogo (gltf-transform e meshoptimizer
// em tools/rig) e o Pillow do Python para a textura (o sharp falha neste computador).
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const JOGO = process.env.JOGO || 'C:/Users/pc/mare-alta';
const ORIGEM = process.env.ORIGEM || path.join(JOGO, 'art/3d/glb-bordado/paulo/tripo-export.glb');
const SAIDA = process.env.SAIDA || path.resolve(aqui, '../../public/resultados3d/paulo.glb');
const TRIS = Number(process.env.TRIS || 18000);
const TEX = Number(process.env.TEX || 1536);
const QUALIDADE = Number(process.env.QUALIDADE || 84);

const require = createRequire(path.join(JOGO, 'tools/rig/package.json'));
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS, EXTTextureWebP } = require('@gltf-transform/extensions');
const { dedup, meshopt, prune, resample, simplify, weld } = require('@gltf-transform/functions');
const { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } = require('meshoptimizer');

// [começo do nome no arquivo do Tripo, nome na página, corte opcional em segundos [de, até]]
// Os clipes sob medida têm 5 s e o gesto ocupa só um trecho: o corte fica com o gesto.
const ANIMACOES = JSON.parse(process.env.ANIMACOES || 'null') || [
  ['idle', 'idle', [0, 7.5]],
  // só o começo: mais adiante ele vira para olhar para trás, e na página ficaria de costas para quem lê
  ['look_around', 'look', [0, 3.6]],
  // o aceno do Tripo é uma continência, e vem andando: a página usa só o tronco dele (ver pauloCena.ts)
  ['greet', 'greet'],
  ['walk', 'walk'],
  ['cheer', 'cheer', [0, 6]],
  // "cast_a_spell" começa com o braço estendido para o lado: na página vira o gesto de apontar para o balão
  ['cast_a_spell', 'point', [0, 2.7]],
  ['dance', 'dance', [0, 9.5]],
  // Ficaram de fora: o joinha sob medida ("The character gives a big…"), que de frente parece mão no rosto,
  // e o da câmera ("The character raises a photo…"), que tapa o rosto.
];

function cortar(sampler, de, ate) {
  const tin = sampler.getInput(), tout = sampler.getOutput();
  const t = tin.getArray(), v = tout.getArray(), n = v.length / t.length;
  const nt = [], nv = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] < de - 1e-4 || t[i] > ate + 1e-4) continue;
    nt.push(t[i] - de);
    for (let k = 0; k < n; k++) nv.push(v[i * n + k]);
  }
  if (nt.length < 2) {
    // trilha parada (uma chave no começo e outra no fim): vira duas chaves no trecho cortado
    let i0 = 0;
    for (let i = 0; i < t.length; i++) if (t[i] <= de + 1e-4) i0 = i;
    nt.length = 0; nv.length = 0;
    for (const tt of [0, ate - de]) { nt.push(tt); for (let k = 0; k < n; k++) nv.push(v[i0 * n + k]); }
  }
  sampler.setInput(tin.clone().setArray(new Float32Array(nt)));
  sampler.setOutput(tout.clone().setArray(new v.constructor(nv)));
}

const conta = (doc) => doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((a, p) => a + (p.getIndices()?.getCount() || 0) / 3, 0), 0);

// Tirar um canal não tira a trilha dele: a trilha (sampler) continua na animação e os números dela vão
// para o arquivo sem ninguém usar. Some com os dois, a não ser que outro canal use a mesma trilha.
function tirarCanal(ch) {
  const s = ch.getSampler();
  ch.dispose();
  if (s && !s.listParents().some((p) => p.propertyType === 'AnimationChannel')) s.dispose();
}
function tirarAnimacao(anim) {
  for (const ch of anim.listChannels()) ch.dispose();
  for (const s of anim.listSamplers()) s.dispose();
  anim.dispose();
}

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const doc = await io.read(ORIGEM);
const root = doc.getRoot();
const antes = conta(doc);

// ---- animações: escolhe, renomeia, corta e tira o que não aparece ----
const info = [];
const deriva = new Map();
const encolhido = new Map();
for (const anim of root.listAnimations()) {
  const regra = ANIMACOES.find(([ini]) => anim.getName().startsWith(ini));
  if (!regra) { tirarAnimacao(anim); continue; }
  anim.setName(regra[1]);
  let dur = 0;
  for (const ch of anim.listChannels()) {
    const no = ch.getTargetNode(), alvo = ch.getTargetPath(), s = ch.getSampler();
    const nome = no?.getName() || '';
    const quadril = /Hips$/.test(nome);
    // fora: escala, posição de osso que não é o quadril e as pontas (ossos _End não deformam nada).
    // Os dedos ficam: na página o Paulo aparece grande e o joinha depende deles.
    if (alvo === 'scale' || /_End$/.test(nome) || (alvo === 'translation' && !quadril)) { tirarCanal(ch); continue; }
    if (regra[2]) cortar(s, regra[2][0], regra[2][1]);
    const tempos = s.getInput().getArray();
    dur = Math.max(dur, tempos[tempos.length - 1]);
    if (alvo === 'translation' && quadril) {
      // o eixo vertical é o maior componente do quadril em repouso; os outros dois são o chão
      const rep = no.getTranslation();
      const vert = [0, 1, 2].reduce((m, k) => (Math.abs(rep[k]) > Math.abs(rep[m]) ? k : m), 1);
      const arr = Float32Array.from(s.getOutput().getArray());
      const n = arr.length / 3;
      const chao = [0, 1, 2].filter((k) => k !== vert);
      // quanto o clipe sai do lugar, em alturas do boneco: o "greet" do Tripo vem andando para a frente
      const desvio = Math.hypot(...chao.map((k) => arr[(n - 1) * 3 + k] - arr[k])) / (Math.abs(rep[vert]) || 1);
      const andando = regra[1] === 'walk' || desvio > 0.6;
      if (desvio > 0.25) deriva.set(regra[1], desvio);
      for (const k of chao) {
        const a0 = arr[k], a1 = arr[(n - 1) * 3 + k];
        for (let i = 0; i < n; i++) {
          const f = (tempos[i] - tempos[0]) / ((tempos[n - 1] - tempos[0]) || 1);
          // andar: tira a deriva (quem move o boneco é a página) e fica só o balanço;
          // o resto: recentra no primeiro quadro, para ele não pular ao trocar de animação
          arr[i * 3 + k] = andando ? arr[i * 3 + k] - a0 - (a1 - a0) * f + rep[k] : arr[i * 3 + k] - a0 + rep[k];
        }
      }
      // A dança passeia mais de meio corpo em direção à câmera, e na faixa da página ele sairia do quadro:
      // o passeio pelo chão é encolhido para caber em PASSEIO (parte da altura do quadril).
      const PASSEIO = 0.22;
      let maior = 0;
      for (let i = 0; i < n; i++) maior = Math.max(maior, Math.hypot(...chao.map((k) => arr[i * 3 + k] - rep[k])));
      const limite = PASSEIO * (Math.abs(rep[vert]) || 1);
      if (maior > limite) {
        for (let i = 0; i < n; i++) for (const k of chao) arr[i * 3 + k] = rep[k] + (arr[i * 3 + k] - rep[k]) * (limite / maior);
        encolhido.set(regra[1], maior / (Math.abs(rep[vert]) || 1));
      }
      s.setOutput(s.getOutput().clone().setArray(arr));
    }
  }
  info.push(`${regra[1]} ${dur.toFixed(2)}s${deriva.has(regra[1]) ? ` (andava ${deriva.get(regra[1]).toFixed(1)} alturas de quadril)` : ''}${encolhido.has(regra[1]) ? ` (passeava ${encolhido.get(regra[1]).toFixed(2)}, encolhido)` : ''}`);
}
const faltou = ANIMACOES.filter(([, nome]) => !root.listAnimations().some((a) => a.getName() === nome));
if (faltou.length) throw new Error('animação não encontrada no arquivo: ' + faltou.map((f) => f[0]).join(', '));

// ---- material: só a cor, fosco (a luz da cena faz o resto) ----
let cor = null;
for (const m of root.listMaterials()) {
  cor = m.getBaseColorTexture() || cor;
  m.setNormalTexture(null); m.setOcclusionTexture(null); m.setMetallicRoughnessTexture(null); m.setEmissiveTexture(null);
  m.setMetallicFactor(0); m.setRoughnessFactor(0.82);
}
if (!cor) throw new Error('o modelo veio sem textura de cor');

await doc.transform(
  dedup(),
  resample({ tolerance: 0.0006 }),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, TRIS / antes), error: 0.003 }),
  prune(),
);

// ---- textura de cor em WebP ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paulo-3d-'));
// COR=<imagem>: usa essa textura de cor no lugar da que veio no arquivo (a que sai do assar_sombra.py)
const COR = process.env.COR || path.join(aqui, 'cor-com-sombra.jpg');
const bruto = fs.existsSync(COR) ? COR : path.join(tmp, 'cor.' + (cor.getMimeType() === 'image/png' ? 'png' : 'jpg'));
const webp = path.join(tmp, 'cor.webp');
if (bruto !== COR) fs.writeFileSync(bruto, Buffer.from(cor.getImage()));
console.log(bruto === COR ? `textura de cor: ${path.relative(process.cwd(), COR)}` : 'textura de cor: a do arquivo (sem a sombra assada)');
execFileSync('python', ['-I', path.join(aqui, 'tex_webp.py'), bruto, webp, String(TEX), String(QUALIDADE)]);
cor.setImage(new Uint8Array(fs.readFileSync(webp))).setMimeType('image/webp');
doc.createExtension(EXTTextureWebP).setRequired(true);
const texKB = fs.statSync(webp).size / 1024;
fs.rmSync(tmp, { recursive: true, force: true });

await doc.transform(meshopt({ encoder: MeshoptEncoder, level: process.env.NIVEL || 'high' }));

const glb = await io.writeBinary(doc);
fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
fs.writeFileSync(SAIDA, glb);

console.log(`${path.relative(process.cwd(), SAIDA)}: ${Math.round(antes)} -> ${Math.round(conta(doc))} triângulos, ${(glb.length / 1024).toFixed(0)} KB (textura ${TEX}px ${texKB.toFixed(0)} KB)`);
console.log('   ' + info.join(' · '));
