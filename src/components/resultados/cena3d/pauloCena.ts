import {
  AnimationClip,
  AnimationMixer,
  AnimationUtils,
  CanvasTexture,
  DirectionalLight,
  Group,
  HemisphereLight,
  LoopOnce,
  LoopRepeat,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
  type AnimationAction,
  type PerspectiveCamera,
  type Material,
  type Object3D,
  type Texture,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { GestoPaulo } from "@/lib/falasDoPaulo";
import { aproximar, criarPalco } from "./palco";

/**
 * O Mini Paulo em 3D no topo da página de resultados: chega andando pela
 * direita, acena e fica no lugar, respirando e olhando em volta. Faz um gesto
 * quando a página pede e acompanha o ponteiro com a cabeça.
 *
 * O modelo é o mesmo do jogo (Tripo, com esqueleto e o bordado oficial na
 * textura), preparado por `motion/paulo-3d/empacotar.mjs`. Ele tem cerca de 1
 * de altura, pisa em y = 0 e olha para +Z.
 */

export const MODELO_DO_PAULO = "/resultados3d/paulo.glb";

/** Altura do mundo que cabe na caixa: o Paulo (1) mais a folga dos braços erguidos. */
const QUADRO = 1.36;
/** Quanto do quadro fica abaixo do pé, para a sombra não encostar na borda. */
const PE = 0.05;
const FOV = 24;
/** Velocidade da caminhada de entrada, em alturas do Paulo por segundo (o passo do clipe). */
const PASSO = 0.6;
/** De lado, na caminhada; quase de frente, parado (um pouco virado para o balão). */
const GIRO_ANDANDO = -1.2;
const GIRO_PARADO = -0.2;

export interface OpcoesPaulo {
  /** Onde ele pára, de 0 (borda esquerda da caixa) a 1 (direita). */
  lugar: number;
  /** Chega andando pela direita. Sem isso, já aparece no lugar. */
  entrada: boolean;
  /** "Reduzir movimento": fica numa pose parada, e o gesto vira troca de pose. */
  semMovimento?: boolean;
  /** Parou no lugar e começou a acenar: hora de abrir o balão. */
  aoChegar?: () => void;
  aoFalhar?: () => void;
}

export interface CenaPaulo {
  gesto(nome: GestoPaulo): void;
  /** Ponteiro, em pixels dentro da caixa; null quando ele sai. */
  olhar(x: number | null, y?: number): void;
  /** Olha um instante para um lado (−1 esquerda, 1 direita) e volta. */
  relance(lado: number): void;
  definirLugar(lugar: number): void;
  /** Só para conferência: o modelo já carregou? */
  pronto(): boolean;
  /** Só para conferência: avança a cena sem esperar o relógio. */
  saltar(segundos: number): void;
  destruir(): void;
}

/** Ossos da cintura para cima (tronco, braços, mãos, pescoço e cabeça). */
const TRONCO = /(Spine|Shoulder|Arm|Hand|Neck|Head)/;
/** Só os braços e as mãos: o tronco fica ereto, como no descanso. */
const BRACOS = /(Shoulder|Arm|Hand)/;

/**
 * Gesto de meio corpo: os ossos escolhidos vêm de um trecho do clipe do gesto,
 * o resto do corpo continua o do clipe de descanso. Os clipes do Tripo trazem
 * o corpo inteiro (o aceno vem andando, o "apontar" vem em posição de luta e
 * curvado para a frente); na página o Paulo gesticula parado, de pé.
 */
export function gestoDeMeioCorpo(nome: string, gesto: AnimationClip, descanso: AnimationClip, corte: { de: number; ate: number; ossos: RegExp }): AnimationClip {
  const fps = 30;
  const duracao = corte.ate - corte.de;
  const alto = AnimationUtils.subclip(gesto, `${nome}-gesto`, Math.round(corte.de * fps), Math.round(corte.ate * fps), fps);
  const baixo = AnimationUtils.subclip(descanso, `${nome}-descanso`, 0, Math.round(duracao * fps), fps);
  const trilhas = [...alto.tracks.filter((t) => corte.ossos.test(t.name)), ...baixo.tracks.filter((t) => !corte.ossos.test(t.name))];
  return new AnimationClip(nome, duracao, trilhas);
}

/** Gestos refeitos com meio corpo: trecho do clipe original (em segundos) e os ossos que vêm dele. */
export const GESTOS_DE_MEIO_CORPO: Record<string, { de: number; ate: number; ossos: RegExp }> = {
  // a mão sobe à testa e desce
  greet: { de: 1.0, ate: 2.9, ossos: TRONCO },
  // o braço fica estendido para o lado do balão; depois disso o clipe recolhe as mãos
  point: { de: 0.0, ate: 0.95, ossos: BRACOS },
};

function texturaDaSombra(): CanvasTexture {
  const tela = document.createElement("canvas");
  tela.width = 128;
  tela.height = 128;
  const c = tela.getContext("2d")!;
  const g = c.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(0.55, "rgba(0,0,0,0.22)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 128);
  return new CanvasTexture(tela);
}

export function criarCenaPaulo(caixa: HTMLElement, opcoes: OpcoesPaulo): CenaPaulo | null {
  let lugar = opcoes.lugar;
  let destruido = false;
  let visto = false;
  let modelo: Object3D | null = null;
  let mixer: AnimationMixer | null = null;
  const acoes = new Map<string, AnimationAction>();
  let atual: AnimationAction | null = null;
  let descanso: "idle" | "look" = "idle";
  let estado: "esperando" | "entrando" | "parado" = "esperando";
  let cabeca: Object3D | null = null;
  let pescoco: Object3D | null = null;
  let meiaLargura = 1;

  // para onde a cabeça quer virar (ponteiro) e onde ela está
  const ponteiro = { x: 0, y: 0, ativo: false };
  let relanceAte = 0;
  let relanceLado = 0;
  let relogio = 0;
  let giroCabeca = 0;
  let inclinacao = 0;
  const pontoCabeca = new Vector3();
  const naTela = { x: 0, y: 0 };

  const grupo = new Group();
  // A câmera olha quase de frente: uma sombra deitada no chão viraria um risco de 2 pixels.
  // Ela é uma elipse de pé, logo atrás dos tênis, que é como o olho a espera ver daqui.
  const sombra = new Mesh(
    new PlaneGeometry(0.6, 0.1),
    new MeshBasicMaterial({ map: texturaDaSombra(), transparent: true, depthWrite: false, opacity: 0.62 }),
  );
  sombra.position.set(0, 0.012, -0.08);
  sombra.renderOrder = -1;
  sombra.visible = false;

  // o palco mede a caixa e chama aoRedimensionar ainda dentro de criarPalco, antes de devolver a câmera
  let camera: PerspectiveCamera | null = null;

  const palco = criarPalco(caixa, {
    fov: FOV,
    aoQuadro: (dt) => {
      if (opcoes.semMovimento) return false;
      avancar(dt);
      // parado ele continua respirando: o laço só pára quando a peça sai da tela ou a aba fecha
      return !!modelo;
    },
    aoRedimensionar: () => {
      enquadrar();
      if (estado !== "entrando") grupo.position.x = xDoLugar();
    },
    aoAparecer: () => {
      visto = true;
      comecar();
    },
  });
  if (!palco) return null;
  palco.tela.style.pointerEvents = "none";

  const { cena } = palco;
  camera = palco.camera;
  cena.add(new HemisphereLight("#eef4ff", "#9a7c5c", 1.25));
  const sol = new DirectionalLight("#fff0dc", 2.1);
  sol.position.set(1.4, 2.4, 2.6);
  cena.add(sol);
  // contraluz frio: solta o Paulo do fundo azul e da foto
  const contra = new DirectionalLight("#bcd8ff", 1.3);
  contra.position.set(-1.8, 1.6, -2.0);
  cena.add(contra);
  cena.add(grupo, sombra);

  function enquadrar() {
    if (!camera) return;
    const distancia = QUADRO / 2 / Math.tan(MathUtils.degToRad(FOV / 2));
    const centro = QUADRO / 2 - PE;
    camera.position.set(0, centro + 0.1, distancia);
    camera.lookAt(0, centro, 0);
    meiaLargura = (QUADRO / 2) * camera.aspect;
  }

  function xDoLugar() {
    return (lugar * 2 - 1) * meiaLargura;
  }

  function tocar(nome: string, o: { fade?: number; repetir?: boolean } = {}) {
    const proxima = acoes.get(nome);
    if (!proxima) return false;
    const fade = o.fade ?? 0.3;
    proxima.reset();
    proxima.setLoop(o.repetir ? LoopRepeat : LoopOnce, o.repetir ? Infinity : 1);
    proxima.clampWhenFinished = !o.repetir;
    proxima.enabled = true;
    proxima.setEffectiveTimeScale(1);
    proxima.setEffectiveWeight(1);
    if (atual && atual !== proxima) proxima.crossFadeFrom(atual, fade, false);
    proxima.play();
    atual = proxima;
    return true;
  }

  /** Parado: respira (idle) e, de vez em quando, olha em volta. Um clipe emenda no outro. */
  function descansar(fade = 0.45) {
    descanso = descanso === "idle" ? "look" : "idle";
    if (!tocar(descanso, { fade })) tocar("idle", { fade, repetir: true });
  }

  function chegar() {
    estado = "parado";
    grupo.position.x = xDoLugar();
    if (!tocar("greet", { fade: 0.25 })) descansar();
    opcoes.aoChegar?.();
  }

  /** Sem movimento: uma pose do clipe, parada (o meio do gesto é onde ele se lê melhor). */
  function posar(nome: string, parte: number) {
    const acao = acoes.get(nome);
    if (!acao || !mixer) return false;
    mixer.stopAllAction();
    acao.reset();
    acao.setLoop(LoopOnce, 1);
    acao.clampWhenFinished = true;
    acao.play();
    acao.time = acao.getClip().duration * parte;
    acao.paused = true;
    mixer.update(0);
    atual = acao;
    return true;
  }

  function comecar() {
    if (!modelo || !visto || estado !== "esperando") return;
    sombra.visible = true;
    modelo.visible = true;
    if (opcoes.semMovimento) {
      estado = "parado";
      grupo.position.x = xDoLugar();
      grupo.rotation.y = GIRO_PARADO;
      sombra.position.x = grupo.position.x;
      posar("greet", 0.45);
      opcoes.aoChegar?.();
      palco!.pedirQuadro();
      return;
    }
    if (opcoes.entrada && acoes.has("walk")) {
      estado = "entrando";
      grupo.position.x = meiaLargura + 0.32;
      grupo.rotation.y = GIRO_ANDANDO;
      tocar("walk", { fade: 0, repetir: true });
    } else {
      grupo.rotation.y = GIRO_PARADO;
      chegar();
    }
    palco!.pedirQuadro();
  }

  function avancar(dt: number) {
    if (!modelo || !mixer) return;
    relogio += dt;
    if (estado === "entrando") {
      grupo.position.x -= PASSO * dt;
      // perto do lugar ele já começa a virar de frente
      const falta = grupo.position.x - xDoLugar();
      if (falta < 0.28) grupo.rotation.y = aproximar(grupo.rotation.y, GIRO_PARADO, dt, 5);
      if (falta <= 0) chegar();
    } else if (estado === "parado") {
      grupo.rotation.y = aproximar(grupo.rotation.y, GIRO_PARADO, dt, 7);
    }
    mixer.update(dt);

    // cabeça: segue o ponteiro (ou dá uma olhada de lado) por cima da animação do quadro
    let alvoGiro = 0;
    let alvoInclinacao = 0;
    if (estado === "parado") {
      if (relogio < relanceAte) {
        alvoGiro = 0.5 * relanceLado;
      } else if (ponteiro.ativo && cabeca) {
        cabeca.getWorldPosition(pontoCabeca);
        palco!.projetar(pontoCabeca, naTela);
        const base = palco!.altura() || 1;
        alvoGiro = MathUtils.clamp(((ponteiro.x - naTela.x) / base) * 1.1, -0.75, 0.75);
        alvoInclinacao = MathUtils.clamp(((ponteiro.y - naTela.y) / base) * 0.8, -0.3, 0.42);
      }
    }
    giroCabeca = aproximar(giroCabeca, alvoGiro, dt, 6);
    inclinacao = aproximar(inclinacao, alvoInclinacao, dt, 6);
    // o corpo já está um pouco virado: desconta, para o rosto apontar de fato para o ponteiro
    const giro = giroCabeca - grupo.rotation.y * (estado === "parado" && (ponteiro.ativo || relogio < relanceAte) ? 1 : 0);
    if (pescoco) {
      pescoco.rotateY(giro * 0.35);
      pescoco.rotateX(inclinacao * 0.35);
    }
    if (cabeca) {
      cabeca.rotateY(giro * 0.65);
      cabeca.rotateX(inclinacao * 0.65);
    }
    sombra.position.x = grupo.position.x;
  }

  enquadrar();

  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(
    MODELO_DO_PAULO,
    (gltf) => {
      if (destruido) return;
      modelo = gltf.scene;
      modelo.visible = false;
      const anisotropia = Math.min(4, palco.renderizador.capabilities.getMaxAnisotropy());
      modelo.traverse((o) => {
        const malha = o as Mesh;
        if (malha.isMesh) {
          // a caixa de corte de malha com esqueleto é a da pose de repouso: com o braço erguido ela sumiria
          malha.frustumCulled = false;
          const mapa = (malha.material as Material & { map?: Texture | null }).map;
          if (mapa) mapa.anisotropy = anisotropia;
        }
        if (/Head$/.test(o.name)) cabeca = o;
        if (/Neck$/.test(o.name)) pescoco = o;
      });
      grupo.add(modelo);
      mixer = new AnimationMixer(modelo);
      const descansoBase = gltf.animations.find((c) => c.name === "idle");
      for (const clipe of gltf.animations) {
        const corte = GESTOS_DE_MEIO_CORPO[clipe.name];
        acoes.set(clipe.name, mixer.clipAction(corte && descansoBase ? gestoDeMeioCorpo(clipe.name, clipe, descansoBase, corte) : clipe));
      }
      mixer.addEventListener("finished", (e) => {
        if (e.action === atual && estado === "parado") descansar();
      });
      comecar();
    },
    undefined,
    () => {
      if (!destruido) opcoes.aoFalhar?.();
    },
  );

  return {
    gesto(nome) {
      if (estado !== "parado") return;
      if (opcoes.semMovimento ? posar(nome, 0.45) : tocar(nome, { fade: 0.25 })) palco.pedirQuadro();
    },
    olhar(x, y = 0) {
      ponteiro.ativo = x != null;
      if (x != null) {
        ponteiro.x = x;
        ponteiro.y = y;
      }
    },
    relance(lado) {
      relanceLado = lado;
      relanceAte = relogio + 1.1;
    },
    definirLugar(novo) {
      lugar = novo;
      if (estado === "parado") {
        grupo.position.x = xDoLugar();
        sombra.position.x = grupo.position.x;
      }
      palco.pedirQuadro();
    },
    pronto: () => !!modelo,
    saltar(segundos) {
      visto = true;
      comecar();
      for (let t = 0; t < segundos; t += 1 / 30) avancar(1 / 30);
      palco.pedirQuadro();
    },
    destruir() {
      destruido = true;
      mixer?.stopAllAction();
      modelo?.traverse((o) => {
        const malha = o as Mesh;
        if (!malha.isMesh) return;
        malha.geometry.dispose();
        const material = malha.material as Material & { map?: Texture | null };
        material.map?.dispose();
        material.dispose();
      });
      sombra.geometry.dispose();
      (sombra.material as MeshBasicMaterial).map?.dispose();
      (sombra.material as MeshBasicMaterial).dispose();
      palco.destruir();
    },
  };
}
