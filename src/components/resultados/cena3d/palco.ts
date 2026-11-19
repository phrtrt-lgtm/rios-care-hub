import { Color, ExtrudeGeometry, PerspectiveCamera, Scene, Shape, SRGBColorSpace, Vector3, WebGLRenderer } from "three";

/**
 * Base das peças 3D da página de resultados (three.js puro, sem camada de React).
 *
 * O que ela garante, para a página não pesar no celular:
 * - só desenha com a peça à vista e a aba aberta, e pára quando nada se mexe;
 * - no máximo 2 pixels de tela por pixel (telas de 3× não ganham nada além disso);
 * - devolve o contexto WebGL ao sair (o navegador mantém poucos por página).
 */

/* ------------------------------------------------------------------------ */
/* Cores do tema                                                             */
/* ------------------------------------------------------------------------ */

/** Lê um token de cor do tema ("20 63% 48%") como cor do three.js. */
export function corDoTema(token: string, reserva = "#8a94a0"): Color {
  const bruto = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const m = bruto.match(/^([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/);
  if (!m) return new Color(reserva);
  return new Color().setHSL((Number(m[1]) % 360) / 360, Number(m[2]) / 100, Number(m[3]) / 100, SRGBColorSpace);
}

/** Avisa quando o tema muda (classe no <html> ou preferência do sistema). */
export function observarTema(aoMudar: () => void): () => void {
  const observador = new MutationObserver(aoMudar);
  observador.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
  const midia = window.matchMedia("(prefers-color-scheme: dark)");
  midia.addEventListener("change", aoMudar);
  return () => {
    observador.disconnect();
    midia.removeEventListener("change", aoMudar);
  };
}

/* ------------------------------------------------------------------------ */
/* Geometria                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * Bloco de base quadrada com os cantos arredondados, de altura 1 e com o pé
 * em y = 0. Arredondado só na planta: esticar na altura não deforma o canto.
 */
export function prismaArredondado(lado: number, raio: number): ExtrudeGeometry {
  const s = lado / 2;
  const r = Math.min(raio, s);
  const forma = new Shape();
  forma.moveTo(-s + r, -s);
  forma.lineTo(s - r, -s);
  forma.quadraticCurveTo(s, -s, s, -s + r);
  forma.lineTo(s, s - r);
  forma.quadraticCurveTo(s, s, s - r, s);
  forma.lineTo(-s + r, s);
  forma.quadraticCurveTo(-s, s, -s, s - r);
  forma.lineTo(-s, -s + r);
  forma.quadraticCurveTo(-s, -s, -s + r, -s);
  const geometria = new ExtrudeGeometry(forma, { depth: 1, bevelEnabled: false, curveSegments: 3 });
  geometria.rotateX(-Math.PI / 2); // a extrusão sai em +z; deitada, vira altura
  return geometria;
}

/* ------------------------------------------------------------------------ */
/* Câmera                                                                    */
/* ------------------------------------------------------------------------ */

const direcao = new Vector3();
const frente = new Vector3();
const direita = new Vector3();
const acima = new Vector3();
const relativo = new Vector3();
const CIMA = new Vector3(0, 1, 0);

function direcaoDaCamera(yaw: number, pitch: number, saida: Vector3): Vector3 {
  return saida.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
}

/** Câmera em órbita: `yaw` gira em volta do eixo vertical, `pitch` é a altura do olhar. */
export function posicionarCamera(camera: PerspectiveCamera, alvo: Vector3, distancia: number, yaw: number, pitch: number) {
  direcaoDaCamera(yaw, pitch, direcao);
  camera.position.copy(alvo).addScaledVector(direcao, distancia);
  camera.lookAt(alvo);
}

/** Menor distância em que todos os pontos cabem no quadro, para aquele ângulo. */
export function distanciaParaCaber(camera: PerspectiveCamera, pontos: Vector3[], alvo: Vector3, yaw: number, pitch: number, folga = 1.04): number {
  direcaoDaCamera(yaw, pitch, direcao);
  frente.copy(direcao).negate();
  direita.crossVectors(frente, CIMA).normalize();
  acima.crossVectors(direita, frente);
  const tanV = Math.tan((camera.fov * Math.PI) / 360);
  const tanH = tanV * camera.aspect;
  let distancia = 1;
  for (const p of pontos) {
    relativo.copy(p).sub(alvo);
    const fundo = relativo.dot(frente);
    distancia = Math.max(distancia, Math.abs(relativo.dot(direita)) / tanH - fundo, Math.abs(relativo.dot(acima)) / tanV - fundo);
  }
  return distancia * folga;
}

/**
 * Enquadra um conjunto de pontos: escreve em `alvo` o centro do que se vê
 * daquele ângulo (para a peça ficar no meio do quadro, e não o ponto 0 do
 * mundo) e devolve a distância em que tudo cabe.
 */
export function enquadrar(camera: PerspectiveCamera, pontos: Vector3[], yaw: number, pitch: number, alvo: Vector3, folga = 1.05): number {
  direcaoDaCamera(yaw, pitch, direcao);
  frente.copy(direcao).negate();
  direita.crossVectors(frente, CIMA).normalize();
  acima.crossVectors(direita, frente);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const p of pontos) {
    const x = p.dot(direita);
    const y = p.dot(acima);
    const z = p.dot(frente);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  alvo
    .set(0, 0, 0)
    .addScaledVector(direita, (x0 + x1) / 2)
    .addScaledVector(acima, (y0 + y1) / 2)
    .addScaledVector(frente, (z0 + z1) / 2);
  return distanciaParaCaber(camera, pontos, alvo, yaw, pitch, folga);
}

/* ------------------------------------------------------------------------ */
/* Palco                                                                     */
/* ------------------------------------------------------------------------ */

export interface OpcoesPalco {
  /** Campo de visão vertical, em graus */
  fov?: number;
  /** A cada quadro, antes de desenhar. Devolve true enquanto algo ainda se mexe. */
  aoQuadro: (dt: number, agora: number) => boolean;
  /** Depois de desenhar: hora de reposicionar os rótulos em HTML. */
  depoisDoQuadro?: () => void;
  aoRedimensionar?: (largura: number, altura: number) => void;
  /** Uma vez, quando um terço da peça entra na tela (dispara a animação de entrada). */
  aoAparecer?: () => void;
}

export interface Palco {
  cena: Scene;
  camera: PerspectiveCamera;
  renderizador: WebGLRenderer;
  tela: HTMLCanvasElement;
  largura(): number;
  altura(): number;
  /** Pede um quadro novo. O laço só roda enquanto há pedido. */
  pedirQuadro(): void;
  /** Ponto do mundo → pixels dentro da caixa. Devolve false se ficou atrás da câmera. */
  projetar(ponto: Vector3, saida: { x: number; y: number }): boolean;
  destruir(): void;
}

const projetado = new Vector3();

export function criarPalco(caixa: HTMLElement, opcoes: OpcoesPalco): Palco | null {
  let renderizador: WebGLRenderer;
  try {
    renderizador = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  } catch {
    return null;
  }
  const tela = renderizador.domElement;
  // pan-y: o dedo na vertical continua rolando a página; na horizontal, gira a peça
  tela.style.cssText = "display:block;width:100%;height:100%;touch-action:pan-y;outline:none;";
  tela.setAttribute("aria-hidden", "true");
  caixa.appendChild(tela);
  renderizador.setClearColor(0x000000, 0);

  const cena = new Scene();
  const camera = new PerspectiveCamera(opcoes.fov ?? 30, 1, 0.1, 600);

  let largura = 0;
  let altura = 0;
  let visivel = typeof IntersectionObserver === "undefined";
  let apareceu = false;
  let destruido = false;
  let agendado = false;
  let quadroId = 0;
  let ultimo = 0;

  function pedirQuadro() {
    if (agendado || destruido) return;
    agendado = true;
    quadroId = requestAnimationFrame(quadro);
  }

  function quadro(agora: number) {
    agendado = false;
    if (destruido || !visivel || document.hidden || !largura) {
      ultimo = 0;
      return;
    }
    const dt = ultimo ? Math.min(0.05, (agora - ultimo) / 1000) : 1 / 60;
    ultimo = agora;
    const continua = opcoes.aoQuadro(dt, agora / 1000);
    renderizador.render(cena, camera);
    opcoes.depoisDoQuadro?.();
    if (continua) pedirQuadro();
    else ultimo = 0;
  }

  function medir() {
    const l = caixa.clientWidth;
    const a = caixa.clientHeight;
    if (!l || !a || (l === largura && a === altura)) return;
    largura = l;
    altura = a;
    renderizador.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderizador.setSize(l, a, false);
    camera.aspect = l / a;
    camera.updateProjectionMatrix();
    opcoes.aoRedimensionar?.(l, a);
    pedirQuadro();
  }

  const aoMedir = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
  aoMedir?.observe(caixa);
  medir();

  function surgir() {
    if (apareceu) return;
    apareceu = true;
    opcoes.aoAparecer?.();
  }

  const aoVer =
    typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(
          (entradas) => {
            for (const e of entradas) {
              visivel = e.isIntersecting;
              if (e.intersectionRatio >= 0.3) surgir();
            }
            pedirQuadro();
          },
          { threshold: [0, 0.3] },
        )
      : null;
  if (aoVer) aoVer.observe(caixa);
  else surgir();

  const aoTrocarDeAba = () => pedirQuadro();
  document.addEventListener("visibilitychange", aoTrocarDeAba);

  // contexto perdido (aba em segundo plano no celular): sem isso a tela fica preta ao voltar
  const aoPerder = (e: Event) => e.preventDefault();
  const aoRecuperar = () => pedirQuadro();
  tela.addEventListener("webglcontextlost", aoPerder);
  tela.addEventListener("webglcontextrestored", aoRecuperar);

  return {
    cena,
    camera,
    renderizador,
    tela,
    largura: () => largura,
    altura: () => altura,
    pedirQuadro,
    projetar(ponto, saida) {
      projetado.copy(ponto).project(camera);
      saida.x = (projetado.x * 0.5 + 0.5) * largura;
      saida.y = (-projetado.y * 0.5 + 0.5) * altura;
      return projetado.z < 1;
    },
    destruir() {
      destruido = true;
      cancelAnimationFrame(quadroId);
      aoMedir?.disconnect();
      aoVer?.disconnect();
      document.removeEventListener("visibilitychange", aoTrocarDeAba);
      tela.removeEventListener("webglcontextlost", aoPerder);
      tela.removeEventListener("webglcontextrestored", aoRecuperar);
      renderizador.dispose();
      renderizador.forceContextLoss();
      tela.remove();
    },
  };
}

/* ------------------------------------------------------------------------ */
/* Giro com o dedo ou o mouse                                                */
/* ------------------------------------------------------------------------ */

export interface OpcoesGiro {
  yaw: number;
  pitch: number;
  /** Quanto dá para girar para cada lado a partir do ângulo inicial */
  aberturaYaw: number;
  pitchMin: number;
  pitchMax: number;
  /** Algo mudou: peça um quadro */
  aoMexer: () => void;
  /** Toque ou clique sem arrastar, em pixels dentro da tela */
  aoTocar?: (x: number, y: number, tipo: string) => void;
}

export interface Giro {
  yaw: number;
  pitch: number;
  arrastando: boolean;
  /** Avança a inércia. Devolve true enquanto ainda gira sozinho. */
  avancar(dt: number): boolean;
  destruir(): void;
}

export function controlarGiro(tela: HTMLElement, o: OpcoesGiro): Giro {
  const yawMin = o.yaw - o.aberturaYaw;
  const yawMax = o.yaw + o.aberturaYaw;
  let ponteiro: number | null = null;
  let x0 = 0;
  let y0 = 0;
  let xAnterior = 0;
  let yAnterior = 0;
  let tAnterior = 0;
  let andou = 0;
  let velocidade = 0;

  const giro: Giro = {
    yaw: o.yaw,
    pitch: o.pitch,
    arrastando: false,
    avancar(dt) {
      if (giro.arrastando || Math.abs(velocidade) < 0.02) {
        if (!giro.arrastando) velocidade = 0;
        return false;
      }
      giro.yaw = Math.min(yawMax, Math.max(yawMin, giro.yaw + velocidade * dt));
      velocidade *= Math.exp(-dt * 4.5);
      if (giro.yaw === yawMin || giro.yaw === yawMax) velocidade = 0;
      return true;
    },
    destruir() {
      tela.removeEventListener("pointerdown", aoDescer);
      tela.removeEventListener("pointermove", aoMover);
      tela.removeEventListener("pointerup", aoSubir);
      tela.removeEventListener("pointercancel", aoCancelar);
    },
  };

  function aoDescer(e: PointerEvent) {
    if (ponteiro != null || (e.pointerType === "mouse" && e.button !== 0)) return;
    ponteiro = e.pointerId;
    x0 = xAnterior = e.clientX;
    y0 = yAnterior = e.clientY;
    tAnterior = e.timeStamp;
    andou = 0;
    velocidade = 0;
    try {
      tela.setPointerCapture(e.pointerId);
    } catch {
      /* ponteiro já solto: segue sem captura */
    }
  }

  function aoMover(e: PointerEvent) {
    if (e.pointerId !== ponteiro) return;
    const dx = e.clientX - xAnterior;
    const dy = e.clientY - yAnterior;
    andou = Math.max(andou, Math.hypot(e.clientX - x0, e.clientY - y0));
    if (!giro.arrastando && andou < 6) return;
    if (!giro.arrastando) {
      giro.arrastando = true;
      tela.style.cursor = "grabbing";
    }
    const passo = -dx * 0.0075;
    giro.yaw = Math.min(yawMax, Math.max(yawMin, giro.yaw + passo));
    // no toque a vertical é da página (pan-y); com o mouse ela inclina a peça
    if (e.pointerType === "mouse") giro.pitch = Math.min(o.pitchMax, Math.max(o.pitchMin, giro.pitch + dy * 0.004));
    const dt = Math.max(1, e.timeStamp - tAnterior) / 1000;
    velocidade = velocidade * 0.6 + (passo / dt) * 0.4;
    xAnterior = e.clientX;
    yAnterior = e.clientY;
    tAnterior = e.timeStamp;
    o.aoMexer();
  }

  function soltar(e: PointerEvent) {
    ponteiro = null;
    tela.style.cursor = "grab";
    try {
      tela.releasePointerCapture(e.pointerId);
    } catch {
      /* nada a soltar */
    }
  }

  function aoSubir(e: PointerEvent) {
    if (e.pointerId !== ponteiro) return;
    const foiToque = !giro.arrastando;
    giro.arrastando = false;
    soltar(e);
    if (foiToque) {
      velocidade = 0;
      const caixa = tela.getBoundingClientRect();
      o.aoTocar?.(e.clientX - caixa.left, e.clientY - caixa.top, e.pointerType);
    } else {
      velocidade = Math.max(-2.5, Math.min(2.5, velocidade));
    }
    o.aoMexer();
  }

  function aoCancelar(e: PointerEvent) {
    if (e.pointerId !== ponteiro) return;
    giro.arrastando = false;
    velocidade = 0;
    soltar(e);
    o.aoMexer();
  }

  tela.style.cursor = "grab";
  tela.addEventListener("pointerdown", aoDescer);
  tela.addEventListener("pointermove", aoMover);
  tela.addEventListener("pointerup", aoSubir);
  tela.addEventListener("pointercancel", aoCancelar);
  return giro;
}

/* ------------------------------------------------------------------------ */
/* Animação                                                                  */
/* ------------------------------------------------------------------------ */

/** Chega passando um pouco do ponto e assenta. */
export function assentar(t: number, passada = 1.15): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const u = t - 1;
  return 1 + (passada + 1) * u * u * u + passada * u * u;
}

/** Aproxima `atual` de `alvo` sem depender da taxa de quadros. */
export function aproximar(atual: number, alvo: number, dt: number, rapidez = 10): number {
  const novo = atual + (alvo - atual) * (1 - Math.exp(-dt * rapidez));
  return Math.abs(alvo - novo) < 0.002 ? alvo : novo;
}
