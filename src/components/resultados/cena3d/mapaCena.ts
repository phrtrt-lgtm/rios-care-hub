import {
  Color,
  DirectionalLight,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PCFShadowMap,
  QuadraticBezierCurve3,
  Raycaster,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";
import type { OrigemUf } from "@/lib/resultadosImovel";
import { POSICAO_UF } from "../MapaBrasil";
import { aproximar, assentar, controlarGiro, corDoTema, criarPalco, enquadrar, observarTema, posicionarCamera, prismaArredondado, type Palco } from "./palco";

/**
 * Mapa do Brasil em blocos, em 3D: o mesmo desenho do mapa plano (um bloco por
 * estado), com a altura pelo número de reservas e uma rota de cada estado de
 * origem até o estado do imóvel, por onde correm pontos de luz.
 */

const UFS = Object.keys(POSICAO_UF);
const LADO = 0.9;
const BASE = 0.14;
const ALTURA_MIN = 0.36;
const ALTURA_MAX = 1.5;
const SUBIDA = 0.7;
const ERGUIDO = 0.16;
const MAX_ROTAS = 8;
const PITCH = 0.84;
const YAW = -0.46;

export interface ApontadoNoMapa {
  x: number;
  y: number;
  uf: string;
}

export interface OpcoesCenaMapa {
  reduzido: boolean;
  ufs: OrigemUf[];
  /** Estado do imóvel; sem ele o mapa não desenha as rotas */
  destino: string | null;
  /** O que vai em cima de cada estado (a sigla, ou a marca do imóvel): a cena os mantém no lugar */
  rotulos: { current: Record<string, HTMLElement | null> };
  dica: { current: HTMLElement | null };
  aoApontar: (apontado: ApontadoNoMapa | null) => void;
}

export interface CenaMapa {
  /** Dados novos (o período mudou): os blocos sobem ou descem até o valor novo */
  atualizar(ufs: OrigemUf[], destino: string | null): void;
  /** Realça um estado a pedido de fora (a lista ao lado); null solta */
  destacar(uf: string | null): void;
  soltar(): void;
  destruir(): void;
}

interface Rota {
  curva: QuadraticBezierCurve3;
  tubo: Mesh<TubeGeometry, MeshBasicMaterial>;
  faisca: Mesh<SphereGeometry, MeshBasicMaterial>;
  indices: number;
  atraso: number;
  fase: number;
  velocidade: number;
}

export function criarCenaMapa(caixa: HTMLElement, o: OpcoesCenaMapa): CenaMapa | null {
  const xDe = (i: number) => POSICAO_UF[UFS[i]][0] - 2.5;
  const zDe = (i: number) => POSICAO_UF[UFS[i]][1] - 4;

  const alturaAlvo = new Float32Array(UFS.length).fill(BASE);
  const altura = new Float32Array(UFS.length).fill(BASE);
  const forca = new Float32Array(UFS.length);
  const atraso = new Float32Array(UFS.length);
  const realce = new Float32Array(UFS.length);
  let destino = -1;
  let rotas: Rota[] = [];
  let fimDaEntrada = 0;

  let entrada = o.reduzido ? 99 : -1;
  let relogioDasRotas = o.reduzido ? 99 : 0;
  let apontado = -1; // pelo toque ou mouse
  let pedido = -1; // pela lista ao lado
  let formaSuja = true;
  let corSuja = true;
  let balanco = 1;
  let dentro = false;
  let distancia = 0;
  let apontarEm: { x: number; y: number } | null = null;
  let quadrosDaDica = 0;

  let palco: Palco | null = null;
  palco = criarPalco(caixa, {
    fov: 26,
    aoQuadro,
    depoisDoQuadro,
    aoRedimensionar: () => {
      distancia = 0;
    },
    aoAparecer: () => {
      if (entrada < 0) entrada = 0;
      palco?.pedirQuadro();
    },
  });
  if (!palco) return null;
  const { cena, camera, renderizador, tela } = palco;

  renderizador.shadowMap.enabled = true;
  renderizador.shadowMap.type = PCFShadowMap;
  renderizador.shadowMap.autoUpdate = false;

  const ceu = new HemisphereLight(0xffffff, 0xffffff, 1.5);
  const sol = new DirectionalLight(0xffffff, 2.2);
  sol.position.set(-6, 14, 5);
  sol.castShadow = true;
  sol.shadow.mapSize.set(1024, 1024);
  sol.shadow.camera.left = -7;
  sol.shadow.camera.right = 7;
  sol.shadow.camera.top = 7;
  sol.shadow.camera.bottom = -7;
  sol.shadow.camera.near = 1;
  sol.shadow.camera.far = 40;
  sol.shadow.bias = -0.0008;
  sol.shadow.normalBias = 0.03;
  cena.add(ceu, sol, sol.target);

  const geometria = prismaArredondado(LADO, 0.2);
  const materialBloco = new MeshStandardMaterial({ roughness: 0.62, metalness: 0 });
  const blocos = new InstancedMesh(geometria, materialBloco, UFS.length);
  blocos.castShadow = true;
  blocos.receiveShadow = true;
  blocos.frustumCulled = false;
  cena.add(blocos);

  const materialRota = new MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false });
  const materialFaisca = new MeshBasicMaterial();
  const geometriaFaisca = new SphereGeometry(0.085, 12, 10);

  const boneco = new Object3D();
  const cor = new Color();
  const paleta = { piso: new Color(), forte: new Color(), claro: new Color(1, 1, 1) };

  /* ---------- dados ---------- */
  const alvo = new Vector3();
  /** O que precisa caber no quadro: os blocos na altura final, as rotas e a marca do imóvel */
  let contorno: Vector3[] = [];

  function limparRotas() {
    for (const r of rotas) {
      cena.remove(r.tubo, r.faisca);
      r.tubo.geometry.dispose();
    }
    rotas = [];
  }

  function receber(ufs: OrigemUf[], ufDestino: string | null) {
    const maximo = Math.max(1, ...ufs.map((u) => u.reservas));
    const porUf = new Map(ufs.map((u, ordem) => [u.uf, { ...u, ordem }]));
    destino = ufDestino ? UFS.indexOf(ufDestino) : -1;
    UFS.forEach((uf, i) => {
      const dado = porUf.get(uf);
      const parte = dado ? dado.reservas / maximo : 0;
      alturaAlvo[i] = dado ? ALTURA_MIN + (ALTURA_MAX - ALTURA_MIN) * Math.pow(parte, 0.75) : BASE;
      forca[i] = dado ? 0.42 + 0.58 * parte : 0;
      atraso[i] = dado ? 0.1 + dado.ordem * 0.09 : 0;
    });
    fimDaEntrada = Math.max(0, ...atraso) + SUBIDA + 0.05;

    limparRotas();
    contorno = [];
    const m = LADO / 2;
    UFS.forEach((_, i) => {
      for (const dx of [-m, m])
        for (const dz of [-m, m]) contorno.push(new Vector3(xDe(i) + dx, 0, zDe(i) + dz), new Vector3(xDe(i) + dx, alturaAlvo[i] + ERGUIDO, zDe(i) + dz));
    });
    if (destino >= 0) {
      const chegada = new Vector3(xDe(destino), alturaAlvo[destino], zDe(destino));
      ufs
        .filter((u) => UFS.indexOf(u.uf) >= 0 && UFS.indexOf(u.uf) !== destino)
        .slice(0, MAX_ROTAS)
        .forEach((u, ordem) => {
          const i = UFS.indexOf(u.uf);
          const saida = new Vector3(xDe(i), alturaAlvo[i], zDe(i));
          const meio = saida.clone().add(chegada).multiplyScalar(0.5);
          meio.y = Math.max(saida.y, chegada.y) + 0.9 + 0.2 * saida.distanceTo(chegada);
          const curva = new QuadraticBezierCurve3(saida, meio, chegada);
          const geometriaTubo = new TubeGeometry(curva, 26, 0.03, 5, false);
          const tubo = new Mesh(geometriaTubo, materialRota);
          const faisca = new Mesh(geometriaFaisca, materialFaisca);
          faisca.visible = false;
          tubo.frustumCulled = false;
          cena.add(tubo, faisca);
          const parte = u.reservas / maximo;
          rotas.push({
            curva,
            tubo,
            faisca,
            indices: geometriaTubo.index ? geometriaTubo.index.count : 0,
            atraso: ordem * 0.14,
            fase: (ordem * 0.37) % 1,
            // quem manda mais hóspedes tem a rota mais movimentada
            velocidade: 0.22 + 0.2 * parte,
          });
          for (const t of [0.3, 0.4, 0.5, 0.6, 0.7]) contorno.push(curva.getPoint(t).add(new Vector3(0, 0.1, 0)));
        });
    }
    relogioDasRotas = o.reduzido ? 99 : 0;
    formaSuja = true;
    corSuja = true;
  }

  function lerTema() {
    // um tom acima do fundo do cartão, para o contorno do país aparecer mesmo nos estados sem reserva
    paleta.piso = corDoTema("--muted").lerp(corDoTema("--border"), 0.5);
    paleta.forte = corDoTema("--grafico-1");
    ceu.groundColor.copy(paleta.piso);
    materialRota.color.copy(corDoTema("--foreground"));
    materialFaisca.color.copy(corDoTema("--primary")).lerp(paleta.claro, 0.25);
    corSuja = true;
  }

  function pintar() {
    UFS.forEach((_, i) => {
      cor.copy(paleta.piso);
      if (forca[i] > 0) cor.lerp(paleta.forte, forca[i]);
      if (realce[i] > 0) cor.lerp(paleta.claro, 0.2 * realce[i]);
      blocos.setColorAt(i, cor);
    });
    if (blocos.instanceColor) blocos.instanceColor.needsUpdate = true;
    corSuja = false;
  }

  function moldar() {
    UFS.forEach((_, i) => {
      boneco.position.set(xDe(i), ERGUIDO * realce[i], zDe(i));
      boneco.scale.set(1, altura[i], 1);
      boneco.updateMatrix();
      blocos.setMatrixAt(i, boneco.matrix);
    });
    blocos.instanceMatrix.needsUpdate = true;
    blocos.boundingSphere = null;
    renderizador.shadowMap.needsUpdate = true;
    formaSuja = false;
  }

  /* ---------- apontar ---------- */
  const giro = controlarGiro(tela, {
    yaw: YAW,
    pitch: PITCH,
    aberturaYaw: 0.95,
    pitchMin: 0.5,
    pitchMax: 1.3,
    aoMexer: () => {
      if (giro.arrastando) apontar(-1);
      palco?.pedirQuadro();
    },
    aoTocar: (x, y, tipo) => mirar(x, y, tipo !== "mouse"),
  });

  const raio = new Raycaster();
  const mira = new Vector2();
  const ponto = new Vector3();
  const naTela = { x: 0, y: 0 };

  // As siglas são HTML por cima da tela: sem esta conferência, a de um estado
  // escondido atrás de um bloco mais alto apareceria em cima do bloco da frente.
  const aVista = new Uint8Array(UFS.length).fill(1);
  const topoDoBloco = new Vector3();
  const rumo = new Vector3();
  let quadros = 0;
  function conferirSiglas() {
    const rotulos = o.rotulos.current;
    camera.updateMatrixWorld();
    UFS.forEach((uf, i) => {
      if (!rotulos[uf]) return;
      topoDoBloco.set(xDe(i), altura[i] + ERGUIDO * realce[i], zDe(i));
      rumo.copy(topoDoBloco).sub(camera.position);
      const ate = rumo.length();
      raio.set(camera.position, rumo.normalize());
      const batida = raio.intersectObject(blocos, false)[0];
      aVista[i] = !batida || batida.instanceId === i || batida.distance > ate - 0.06 ? 1 : 0;
    });
  }

  function lugarDaDica(i: number) {
    ponto.set(xDe(i), altura[i] + ERGUIDO, zDe(i));
    palco!.projetar(ponto, naTela);
    const l = palco!.largura();
    naTela.x = l > 150 ? Math.min(l - 75, Math.max(75, naTela.x)) : l / 2;
    naTela.y = Math.max(46, naTela.y - 8);
  }

  function apontar(i: number) {
    if (i === apontado) return;
    apontado = i;
    if (i < 0) o.aoApontar(null);
    else {
      lugarDaDica(i);
      o.aoApontar({ x: naTela.x, y: naTela.y, uf: UFS[i] });
      quadrosDaDica = 4;
    }
    palco?.pedirQuadro();
  }

  function mirar(x: number, y: number, alternar: boolean) {
    if (!palco || !palco.largura()) return;
    mira.set((x / palco.largura()) * 2 - 1, -(y / palco.altura()) * 2 + 1);
    camera.updateMatrixWorld();
    raio.setFromCamera(mira, camera);
    const batida = raio.intersectObject(blocos, false)[0];
    if (!batida || batida.instanceId == null) return apontar(-1);
    if (alternar && batida.instanceId === apontado) return apontar(-1);
    apontar(batida.instanceId);
  }

  const aoPassar = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || giro.arrastando) return;
    const caixaDaTela = tela.getBoundingClientRect();
    apontarEm = { x: e.clientX - caixaDaTela.left, y: e.clientY - caixaDaTela.top };
    palco?.pedirQuadro();
  };
  const aoEntrar = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    dentro = true;
    palco?.pedirQuadro();
  };
  const aoSair = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    dentro = false;
    apontarEm = null;
    apontar(-1);
    palco?.pedirQuadro();
  };
  tela.addEventListener("pointermove", aoPassar);
  tela.addEventListener("pointerenter", aoEntrar);
  tela.addEventListener("pointerleave", aoSair);

  /* ---------- quadro a quadro ---------- */
  function aoQuadro(dt: number, agora: number): boolean {
    let vivo = false;
    const entrando = entrada >= 0 && entrada < fimDaEntrada;
    if (entrando) {
      entrada += dt;
      // depois da primeira subida, dado novo (outro período) só desliza até o valor, sem refazer a entrada
      if (entrada >= fimDaEntrada) entrada = 99;
      vivo = true;
    }

    for (let i = 0; i < UFS.length; i++) {
      const subida = entrada < 0 ? 0 : assentar((entrada - atraso[i]) / SUBIDA);
      const meta = BASE + (alturaAlvo[i] - BASE) * subida;
      if (altura[i] !== meta) {
        altura[i] = entrando || entrada < 0 ? meta : aproximar(altura[i], meta, dt, 8);
        formaSuja = true;
        vivo = true;
      }
      const metaDoRealce = i === apontado || i === pedido ? 1 : 0;
      if (realce[i] !== metaDoRealce) {
        realce[i] = aproximar(realce[i], metaDoRealce, dt, 14);
        formaSuja = true;
        corSuja = true;
        vivo = true;
      }
    }

    // as rotas se desenham depois que os blocos assentam; as faíscas correm em seguida
    if (entrada >= fimDaEntrada && rotas.length > 0) {
      relogioDasRotas += dt;
      for (const r of rotas) {
        const tracado = Math.min(1, Math.max(0, (relogioDasRotas - r.atraso) / 0.7));
        r.tubo.geometry.setDrawRange(0, Math.floor((r.indices * tracado) / 3) * 3);
        const correndo = tracado >= 1 && !o.reduzido;
        r.faisca.visible = correndo;
        if (correndo) {
          const t = (agora * r.velocidade + r.fase) % 1;
          r.curva.getPoint(t, r.faisca.position);
          r.faisca.scale.setScalar(0.35 + 0.65 * Math.sin(Math.PI * t));
        }
        if (tracado < 1) vivo = true;
      }
      if (!o.reduzido) vivo = true;
    } else {
      for (const r of rotas) {
        r.tubo.geometry.setDrawRange(0, 0);
        r.faisca.visible = false;
      }
    }

    if (giro.avancar(dt)) vivo = true;
    const parado = o.reduzido || dentro || giro.arrastando || apontado >= 0;
    const metaDoBalanco = parado ? 0 : 1;
    if (balanco !== metaDoBalanco) {
      balanco = aproximar(balanco, metaDoBalanco, dt, 3);
      vivo = true;
    }
    if (balanco > 0 && !o.reduzido) vivo = true;
    const yaw = giro.yaw + Math.sin(agora * 0.4) * 0.16 * balanco;

    const cabe = enquadrar(camera, contorno, yaw, giro.pitch, alvo);
    distancia = distancia > 0 ? aproximar(distancia, cabe, dt, 9) : cabe;
    if (distancia !== cabe) vivo = true;
    posicionarCamera(camera, alvo, distancia, yaw, giro.pitch);

    if (apontarEm) {
      const { x, y } = apontarEm;
      apontarEm = null;
      mirar(x, y, false);
    }
    if (formaSuja) moldar();
    if (corSuja) pintar();
    if (quadrosDaDica > 0) {
      quadrosDaDica -= 1;
      vivo = true;
    }
    return vivo;
  }

  function depoisDoQuadro() {
    if (!palco) return;
    if (quadros++ % 5 === 0) conferirSiglas();
    const rotulos = o.rotulos.current;
    UFS.forEach((uf, i) => {
      const el = rotulos[uf];
      if (!el) return;
      ponto.set(xDe(i), altura[i] + ERGUIDO * realce[i], zDe(i));
      palco!.projetar(ponto, naTela);
      el.style.transform = `translate3d(${naTela.x.toFixed(1)}px, ${naTela.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      el.style.opacity = aVista[i] ? "1" : "0";
    });
    const dica = o.dica.current;
    if (dica && apontado >= 0) {
      lugarDaDica(apontado);
      dica.style.transform = `translate3d(${naTela.x.toFixed(1)}px, ${naTela.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
    }
  }

  receber(o.ufs, o.destino);
  lerTema();
  const pararDeObservarTema = observarTema(() => {
    lerTema();
    palco?.pedirQuadro();
  });
  palco.pedirQuadro();

  return {
    atualizar(ufs, ufDestino) {
      apontar(-1);
      receber(ufs, ufDestino);
      palco?.pedirQuadro();
    },
    destacar(uf) {
      pedido = uf ? UFS.indexOf(uf) : -1;
      palco?.pedirQuadro();
    },
    soltar() {
      apontar(-1);
    },
    destruir() {
      pararDeObservarTema();
      tela.removeEventListener("pointermove", aoPassar);
      tela.removeEventListener("pointerenter", aoEntrar);
      tela.removeEventListener("pointerleave", aoSair);
      giro.destruir();
      limparRotas();
      blocos.dispose();
      geometria.dispose();
      geometriaFaisca.dispose();
      materialBloco.dispose();
      materialRota.dispose();
      materialFaisca.dispose();
      palco?.destruir();
      palco = null;
    },
  };
}
