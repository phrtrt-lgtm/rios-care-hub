import {
  Color,
  CylinderGeometry,
  DirectionalLight,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PCFShadowMap,
  Raycaster,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";
import { canalDe, type ReservaCalculada } from "@/lib/resultadosImovel";
import { aproximar, assentar, controlarGiro, corDoTema, criarPalco, enquadrar, observarTema, posicionarCamera, prismaArredondado, type Palco } from "./palco";
import type { ModeloRelevo } from "./relevoModelo";

/**
 * Cena do "ano em relevo": um piso por dia e um bloco por noite reservada.
 * A altura é a diária da reserva, a cor é o canal (a mesma dos gráficos) e as
 * noites que ainda vão acontecer ficam mais claras.
 */

const PASSO_X = 1;
const PASSO_Z = 1.42;
const LADO = 0.84;
const PISO = 0.1;
const ALTURA_MIN = 0.4;
const ALTURA_MAX = 2.7;
const PITCH = 0.84;
const SUBIDA = 0.75;
const ERGUIDO = 0.3;

export interface ApontadoNoRelevo {
  /** Pixels dentro da caixa, no topo do bloco ou do piso apontado */
  x: number;
  y: number;
  dia: number;
  reserva: ReservaCalculada | null;
}

export interface OpcoesCenaRelevo {
  reduzido: boolean;
  periodo: { inicio: number; fim: number };
  /** Um elemento por mês, na ordem do modelo: a cena os mantém ao lado de cada linha */
  rotulos: { current: (HTMLElement | null)[] };
  marcaHoje: { current: HTMLElement | null };
  /** A dica aberta: a cena a mantém presa ao bloco enquanto a câmera se mexe */
  dica: { current: HTMLElement | null };
  aoApontar: (apontado: ApontadoNoRelevo | null) => void;
}

export interface CenaRelevo {
  /** O período escolhido na página mudou: o que fica fora dele esmaece */
  marcarPeriodo(inicio: number, fim: number): void;
  /** Mostra uma reserva a pedido de fora (os recordes ao lado): ergue os blocos dela e abre a dica */
  focarReserva(indice: number): void;
  /** Tira o realce e a dica (toque fora da peça) */
  soltar(): void;
  destruir(): void;
}

export function criarCenaRelevo(caixa: HTMLElement, modelo: ModeloRelevo, o: OpcoesCenaRelevo): CenaRelevo | null {
  const linhas = modelo.meses.length;
  const xDe = (coluna: number) => (coluna - 15) * PASSO_X;
  const zDe = (linha: number) => (linha - (linhas - 1) / 2) * PASSO_Z;

  const alturas = modelo.noites.map((n) => {
    const r = modelo.reservas[n.reserva];
    return ALTURA_MIN + (ALTURA_MAX - ALTURA_MIN) * Math.pow(Math.max(0, r.diariaMedia) / modelo.maiorDiaria, 0.7);
  });
  // a subida corre em onda, do mês mais antigo para o mais novo e do dia 1 ao 31
  const atrasos = modelo.noites.map((n) => n.linha * 0.045 + n.coluna * 0.014);
  const fimDaEntrada = Math.max(0, ...atrasos) + SUBIDA + 0.05;

  let entrada = o.reduzido ? fimDaEntrada : -1; // segundos desde que apareceu; -1 = ainda fora da tela
  let periodo = o.periodo;
  let reservaApontada = -1;
  let diaApontado: number | null = null;
  let formaSuja = true;
  let corSuja = true;
  let balanco = 1;
  let dentro = false;
  let distancia = 0;
  let apontarEm: { x: number; y: number } | null = null;
  let quadrosDaDica = 0;
  const realce = new Float32Array(modelo.reservas.length);

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
  renderizador.shadowMap.autoUpdate = false; // a luz não se mexe: a sombra só é refeita quando um bloco muda

  /* ---------- luz ---------- */
  const ceu = new HemisphereLight(0xffffff, 0xffffff, 1.5);
  const sol = new DirectionalLight(0xffffff, 2.2);
  sol.position.set(-12, 24, 10);
  sol.castShadow = true;
  sol.shadow.mapSize.set(window.innerWidth >= 1024 ? 2048 : 1024, window.innerWidth >= 1024 ? 2048 : 1024);
  sol.shadow.camera.left = -22;
  sol.shadow.camera.right = 22;
  sol.shadow.camera.top = 18;
  sol.shadow.camera.bottom = -18;
  sol.shadow.camera.near = 1;
  sol.shadow.camera.far = 70;
  sol.shadow.bias = -0.0006;
  sol.shadow.normalBias = 0.03;
  cena.add(ceu, sol, sol.target);

  /* ---------- peças ---------- */
  const geometria = prismaArredondado(LADO, 0.17);
  const materialPiso = new MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  const materialBloco = new MeshStandardMaterial({ roughness: 0.58, metalness: 0 });
  const materialMarca = new MeshBasicMaterial();

  const boneco = new Object3D();
  const pisos = new InstancedMesh(geometria, materialPiso, Math.max(1, modelo.pisos.length));
  pisos.count = modelo.pisos.length;
  pisos.receiveShadow = true;
  pisos.frustumCulled = false;
  modelo.pisos.forEach((p, i) => {
    boneco.position.set(xDe(p.coluna), 0, zDe(p.linha));
    boneco.scale.set(1, PISO, 1);
    boneco.updateMatrix();
    pisos.setMatrixAt(i, boneco.matrix);
  });
  pisos.instanceMatrix.needsUpdate = true;

  const blocos = new InstancedMesh(geometria, materialBloco, Math.max(1, modelo.noites.length));
  blocos.count = modelo.noites.length;
  blocos.castShadow = true;
  blocos.receiveShadow = true;
  blocos.frustumCulled = false;
  cena.add(pisos, blocos);

  const topoDaMarca = ALTURA_MAX + 1.05;
  const geometriaHaste = new CylinderGeometry(0.035, 0.035, 1, 8);
  const geometriaBola = new SphereGeometry(0.17, 16, 12);
  if (modelo.hoje) {
    const haste = new Mesh(geometriaHaste, materialMarca);
    haste.scale.y = topoDaMarca;
    haste.position.set(xDe(modelo.hoje.coluna), topoDaMarca / 2, zDe(modelo.hoje.linha));
    const bola = new Mesh(geometriaBola, materialMarca);
    bola.position.set(xDe(modelo.hoje.coluna), topoDaMarca, zDe(modelo.hoje.linha));
    cena.add(haste, bola);
  }

  /* ---------- cores ---------- */
  const paleta = {
    canal: {} as Record<string, Color>,
    piso: new Color(),
    pisoForte: new Color(),
    claro: new Color(1, 1, 1),
  };
  const cor = new Color();

  function lerTema() {
    paleta.canal = {
      airbnb: corDoTema("--grafico-1"),
      booking: corDoTema("--grafico-2"),
      direto: corDoTema("--grafico-3"),
      outros: corDoTema("--grafico-4"),
      desconhecido: corDoTema("--grafico-neutro"),
    };
    paleta.piso = corDoTema("--muted");
    paleta.pisoForte = paleta.piso.clone().lerp(corDoTema("--border"), 0.8);
    ceu.groundColor.copy(paleta.piso);
    materialMarca.color.copy(corDoTema("--foreground"));
    modelo.pisos.forEach((p, i) => pisos.setColorAt(i, p.fimDeSemana ? paleta.pisoForte : paleta.piso));
    if (pisos.instanceColor) pisos.instanceColor.needsUpdate = true;
    corSuja = true;
  }

  function pintar() {
    modelo.noites.forEach((n, k) => {
      const reserva = modelo.reservas[n.reserva];
      cor.copy(paleta.canal[canalDe(reserva.canal) ?? "desconhecido"]);
      if (n.futura) cor.lerp(paleta.piso, 0.46);
      if (n.dia < periodo.inicio || n.dia >= periodo.fim) cor.lerp(paleta.piso, 0.66);
      const r = realce[n.reserva];
      if (r > 0) cor.lerp(paleta.claro, 0.2 * r);
      blocos.setColorAt(k, cor);
    });
    if (blocos.instanceColor) blocos.instanceColor.needsUpdate = true;
    corSuja = false;
  }

  function moldar() {
    modelo.noites.forEach((n, k) => {
      const subida = entrada < 0 ? 0 : assentar((entrada - atrasos[k]) / SUBIDA);
      if (subida <= 0) {
        // ainda não subiu: guardado embaixo do piso, para não brigar com ele na mesma altura
        boneco.position.set(xDe(n.coluna), -1, zDe(n.linha));
        boneco.scale.setScalar(0.0001);
      } else {
        boneco.position.set(xDe(n.coluna), PISO + ERGUIDO * realce[n.reserva], zDe(n.linha));
        boneco.scale.set(1, alturas[k] * subida, 1);
      }
      boneco.updateMatrix();
      blocos.setMatrixAt(k, boneco.matrix);
    });
    blocos.instanceMatrix.needsUpdate = true;
    blocos.boundingSphere = null; // o toque mede de novo
    renderizador.shadowMap.needsUpdate = true;
    formaSuja = false;
  }

  /* ---------- câmera ---------- */
  const alvo = new Vector3();
  const meiaLargura = 15 * PASSO_X + LADO / 2;
  const meioFundo = ((linhas - 1) / 2) * PASSO_Z + LADO / 2;
  const FOLGA_ROTULOS = 3.3; // os nomes dos meses ficam à esquerda de cada linha
  // o que precisa caber no quadro: o piso (com a folga dos rótulos), o topo de cada bloco e a etiqueta "hoje"
  const contorno: Vector3[] = [];
  for (const x of [-meiaLargura - FOLGA_ROTULOS, meiaLargura + 0.3]) for (const z of [-meioFundo - 0.2, meioFundo + 0.2]) contorno.push(new Vector3(x, 0, z));
  modelo.noites.forEach((n, k) => contorno.push(new Vector3(xDe(n.coluna), PISO + alturas[k] + ERGUIDO + 0.15, zDe(n.linha))));
  if (modelo.hoje) contorno.push(new Vector3(xDe(modelo.hoje.coluna), topoDaMarca + 1.1, zDe(modelo.hoje.linha)));

  // tela estreita (celular): mais de lado, para o relevo ocupar a altura que sobra
  const yawInicial = caixa.clientWidth / Math.max(1, caixa.clientHeight) < 1.35 ? -0.8 : -0.3;

  const giro = controlarGiro(tela, {
    yaw: yawInicial,
    pitch: PITCH,
    aberturaYaw: 1,
    pitchMin: 0.5,
    pitchMax: 1.25,
    aoMexer: () => {
      if (giro.arrastando) apontar(null);
      palco?.pedirQuadro();
    },
    aoTocar: (x, y, tipo) => mirar(x, y, tipo !== "mouse"),
  });

  /* ---------- apontar ---------- */
  const raio = new Raycaster();
  const mira = new Vector2();
  const ponto = new Vector3();
  const ancora = new Vector3();
  const naTela = { x: 0, y: 0 };

  /** Onde a dica fica: em cima do bloco, sem sair pelas bordas da caixa. */
  function lugarDaDica() {
    palco!.projetar(ancora, naTela);
    const l = palco!.largura();
    naTela.x = l > 236 ? Math.min(l - 118, Math.max(118, naTela.x)) : l / 2;
    naTela.y = Math.max(66, naTela.y - 10);
  }

  function apontar(noite: number | null, piso: number | null = null) {
    const reserva = noite != null ? modelo.noites[noite].reserva : -1;
    const dia = noite != null ? modelo.noites[noite].dia : piso != null ? modelo.pisos[piso].dia : null;
    if (reserva === reservaApontada && dia === diaApontado) return;
    reservaApontada = reserva;
    diaApontado = dia;
    if (dia == null) {
      o.aoApontar(null);
    } else {
      const celula = noite != null ? modelo.noites[noite] : modelo.pisos[piso!];
      ancora.set(xDe(celula.coluna), noite != null ? PISO + alturas[noite] + ERGUIDO : PISO, zDe(celula.linha));
      lugarDaDica();
      o.aoApontar({ x: naTela.x, y: naTela.y, dia, reserva: reserva >= 0 ? modelo.reservas[reserva] : null });
      quadrosDaDica = 4; // a dica nasce no React um instante depois: garante quadros para prendê-la
    }
    palco?.pedirQuadro();
  }

  function mirar(x: number, y: number, alternar: boolean) {
    if (!palco || !palco.largura()) return;
    mira.set((x / palco.largura()) * 2 - 1, -(y / palco.altura()) * 2 + 1);
    camera.updateMatrixWorld();
    raio.setFromCamera(mira, camera);
    const batida = raio.intersectObjects([blocos, pisos], false)[0];
    if (!batida || batida.instanceId == null) return apontar(null);
    if (batida.object === blocos) {
      // no toque, bater de novo na mesma reserva solta
      if (alternar && modelo.noites[batida.instanceId].reserva === reservaApontada) return apontar(null);
      return apontar(batida.instanceId);
    }
    if (alternar && modelo.pisos[batida.instanceId].dia === diaApontado) return apontar(null);
    apontar(null, batida.instanceId);
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
    apontar(null);
    palco?.pedirQuadro();
  };
  tela.addEventListener("pointermove", aoPassar);
  tela.addEventListener("pointerenter", aoEntrar);
  tela.addEventListener("pointerleave", aoSair);

  /* ---------- quadro a quadro ---------- */
  function aoQuadro(dt: number, agora: number): boolean {
    let vivo = false;

    if (entrada >= 0 && entrada < fimDaEntrada) {
      entrada += dt;
      formaSuja = true;
      vivo = true;
    }

    for (let i = 0; i < realce.length; i++) {
      const meta = i === reservaApontada ? 1 : 0;
      if (realce[i] === meta) continue;
      realce[i] = aproximar(realce[i], meta, dt, 14);
      formaSuja = true;
      corSuja = true;
      vivo = true;
    }

    if (giro.avancar(dt)) vivo = true;

    // o vaivém pára quando a pessoa mexe ou olha um bloco, para o alvo não fugir do dedo
    const parado = o.reduzido || dentro || giro.arrastando || diaApontado != null;
    const metaDoBalanco = parado ? 0 : 1;
    if (balanco !== metaDoBalanco) {
      balanco = aproximar(balanco, metaDoBalanco, dt, 3);
      vivo = true;
    }
    if (balanco > 0 && !o.reduzido) vivo = true;
    const yaw = giro.yaw + Math.sin(agora * 0.45) * 0.085 * balanco;

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
    o.rotulos.current.forEach((el, i) => {
      if (!el) return;
      ponto.set(-meiaLargura - 0.5, 0, zDe(i));
      palco!.projetar(ponto, naTela);
      el.style.transform = `translate3d(${naTela.x.toFixed(1)}px, ${naTela.y.toFixed(1)}px, 0) translate(-100%, -50%)`;
      el.style.opacity = "1";
    });
    const marca = o.marcaHoje.current;
    if (marca && modelo.hoje) {
      ponto.set(xDe(modelo.hoje.coluna), topoDaMarca + 0.25, zDe(modelo.hoje.linha));
      palco.projetar(ponto, naTela);
      marca.style.transform = `translate3d(${naTela.x.toFixed(1)}px, ${naTela.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      marca.style.opacity = "1";
    }
    const dica = o.dica.current;
    if (dica && diaApontado != null) {
      lugarDaDica();
      dica.style.transform = `translate3d(${naTela.x.toFixed(1)}px, ${naTela.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
    }
  }

  lerTema();
  const pararDeObservarTema = observarTema(() => {
    lerTema();
    palco?.pedirQuadro();
  });
  palco.pedirQuadro();

  return {
    marcarPeriodo(inicio, fim) {
      periodo = { inicio, fim };
      corSuja = true;
      palco?.pedirQuadro();
    },
    focarReserva(indice) {
      // a noite do meio da reserva: a dica fica em cima do trecho, não na ponta
      const dela = modelo.noites.map((n, k) => (n.reserva === indice ? k : -1)).filter((k) => k >= 0);
      if (dela.length === 0) return;
      camera.updateMatrixWorld();
      apontar(dela[Math.floor(dela.length / 2)]);
    },
    soltar() {
      apontar(null);
    },
    destruir() {
      pararDeObservarTema();
      tela.removeEventListener("pointermove", aoPassar);
      tela.removeEventListener("pointerenter", aoEntrar);
      tela.removeEventListener("pointerleave", aoSair);
      giro.destruir();
      pisos.dispose();
      blocos.dispose();
      geometria.dispose();
      geometriaHaste.dispose();
      geometriaBola.dispose();
      materialPiso.dispose();
      materialBloco.dispose();
      materialMarca.dispose();
      palco?.destruir();
      palco = null;
    },
  };
}
