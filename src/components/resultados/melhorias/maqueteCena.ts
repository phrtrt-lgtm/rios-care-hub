/**
 * Maquete do plano de melhorias: uma pintura que gira como maquete de verdade.
 *
 * A maquete é uma pintura (GPT Image, no estilo do Maré Alta) feita em cima de uma planta em blocos. Da
 * mesma planta saem dois mapas de profundidade, e é com eles que este desenho desloca cada ponto da
 * pintura ao girar: o que está no fundo anda mais que o que está na frente, como numa maquete na mesa.
 * Cada melhoria é uma camada recortada da pintura; ligar ou desligar uma troca a imagem com uma onda
 * que nasce no lugar do item.
 *
 * WebGL puro, sem three (regra da pasta `cena3d`): um triângulo que cobre a tela e um shader.
 * Quem gera os arquivos: `motion/maquete/` (README lá).
 */

export interface CamadaMaquete {
  id: string;
  x: number;
  y: number;
  l: number;
  a: number;
  /** Centro do item na imagem (px). */
  centro: [number, number];
  /** Profundidade no centro: [fundo no chão, fundo na vista], de 0 a 1. */
  prof: [number, number];
  comodo: string | null;
}

export interface ManifestoMaquete {
  largura: number;
  altura: number;
  px_por_metro: number;
  sen_altura: number;
  faixa_h_px: number;
  faixa_d_px: number;
  comodos: Record<string, { caixa: [number, number, number, number]; h: number; d: number }>;
  camadas: CamadaMaquete[];
}

export interface CenaMaquete {
  /** Quais camadas aparecem. `revelar` é a camada que acabou de mudar: a onda nasce nela. */
  definir(ativos: string[], revelar?: string | null): void;
  /** Aproxima a câmera de um cômodo (ou volta ao todo, com `null`). */
  focar(comodo: string | null): void;
  /** Quantos px da base do canvas ficam cobertos por outra coisa (a faixa da conta): a maquete sobe. */
  margem(base: number): void;
  /** Onde um ponto da imagem está agora, em px do canvas (CSS). */
  projetar(x: number, y: number, h: number, d: number): { x: number; y: number };
  /** Chamado a cada quadro desenhado (para os marcadores em HTML acompanharem). */
  aoDesenhar: (() => void) | null;
  /** Chamado quando a base está na tela. */
  aoChegar: (() => void) | null;
  destruir(): void;
}

const VERTICE = `
attribute vec2 p;
varying vec2 v;
void main() { v = p; gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAGMENTO = `
precision highp float;
uniform sampler2D uAntes;
uniform sampler2D uAgora;
uniform sampler2D uProf;
uniform vec2 uTam;     // imagem (px)
uniform vec2 uTela;    // canvas (px de CSS)
uniform vec3 uCam;     // centro na imagem (px) e escala (px de tela por px de imagem)
uniform vec2 uGiro;    // giro em radianos: x = de lado, y = de cima
uniform vec3 uFaixa;   // quanto vale 1.0 de profundidade em px (chão, vista) e o seno da altura da câmera
uniform vec2 uPivo;    // profundidade que fica parada ao girar
uniform vec4 uOnda;    // centro (px da imagem), raio (px) e quanto da troca falta mostrar (0 = nada)
uniform float uLuz;    // entrada: 0 = escuro, 1 = normal
varying vec2 v;

void main() {
  vec2 tela = v * 0.5 * uTela;
  vec2 P = uCam.xy + vec2(tela.x, -tela.y) / uCam.z;
  // acha de que ponto da pintura veio este ponto da tela (o giro desloca cada ponto conforme a profundidade)
  vec2 s = P;
  float lado = (P.x - uCam.x) * uFaixa.z * uGiro.x;
  for (int i = 0; i < 5; i++) {
    vec4 pr = texture2D(uProf, clamp(s / uTam, 0.0, 1.0));
    s.x = P.x - (pr.r - uPivo.x) * uFaixa.x * uGiro.x;
    s.y = P.y - lado + (pr.g - uPivo.y) * uFaixa.y * uGiro.y;
  }
  vec2 uv = s / uTam;
  vec3 agora = texture2D(uAgora, uv).rgb;
  vec3 cor = agora;
  if (uOnda.w > 0.0) {
    float dist = distance(s, uOnda.xy);
    float fora = smoothstep(uOnda.z - 110.0, uOnda.z, dist);
    vec3 antes = texture2D(uAntes, uv).rgb;
    cor = mix(agora, antes, fora);
    float anel = 1.0 - abs(fora - 0.5) * 2.0;
    cor += vec3(1.0, 0.82, 0.55) * anel * anel * 0.22 * uOnda.w;
  }
  // fora da pintura: a cor do fundo dela, para não aparecer borda
  float dentro = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  cor = mix(texture2D(uAgora, vec2(0.004, 0.004)).rgb, cor, dentro);
  gl_FragColor = vec4(cor * uLuz, 1.0);
}
`;

const GIRO_MAX_X = 0.11;
const GIRO_MAX_Y = 0.05;

function carregar(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => ok(img);
    img.onerror = () => erro(new Error(`imagem ${url}`));
    img.src = url;
  });
}

function suave(atual: number, alvo: number, dt: number, tempo: number): number {
  return atual + (alvo - atual) * (1 - Math.exp(-dt / tempo));
}

/**
 * Monta a cena no canvas. Devolve `null` se o aparelho não tem WebGL (a página mostra a versão em imagens).
 * `pasta` é onde estão `base.webp`, `prof-base.webp`, `camada-*.webp` e `prof-*.webp`.
 */
export function criarCenaMaquete(
  tela: HTMLCanvasElement,
  manifesto: ManifestoMaquete,
  pasta: string,
  opcoes: { parado: boolean; aoFalhar?: () => void },
): CenaMaquete | null {
  const atributos: WebGLContextAttributes = { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power" };
  const gl2 = tela.getContext("webgl2", atributos) as WebGL2RenderingContext | null;
  const gl = (gl2 ?? tela.getContext("webgl", atributos)) as WebGLRenderingContext | null;
  if (!gl) return null;
  const L = manifesto.largura;
  const A = manifesto.altura;
  if (gl.getParameter(gl.MAX_TEXTURE_SIZE) < Math.max(L, A)) return null;

  const compila = (tipo: number, fonte: string) => {
    const sh = gl.createShader(tipo)!;
    gl.shaderSource(sh, fonte);
    gl.compileShader(sh);
    return sh;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compila(gl.VERTEX_SHADER, VERTICE));
  gl.attachShader(prog, compila(gl.FRAGMENT_SHADER, FRAGMENTO));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const ap = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(ap);
  gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
  const u = (nome: string) => gl.getUniformLocation(prog, nome);
  const un = {
    antes: u("uAntes"), agora: u("uAgora"), prof: u("uProf"), tam: u("uTam"), tela: u("uTela"), cam: u("uCam"),
    giro: u("uGiro"), faixa: u("uFaixa"), pivo: u("uPivo"), onda: u("uOnda"), luz: u("uLuz"),
  };
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);

  const novaTextura = (unidade: number, comMipmap: boolean) => {
    const t = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unidade);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, comMipmap && gl2 ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    return t;
  };
  // duas texturas de cor (a de antes e a de agora trocam de papel a cada mudança) e uma de profundidade
  let texAntes = novaTextura(0, true);
  let texAgora = novaTextura(1, true);
  const texProf = novaTextura(2, false);

  const folha = (largura: number, altura: number) => {
    const c = document.createElement("canvas");
    c.width = largura;
    c.height = altura;
    return c;
  };
  const corTela = folha(L, A);
  const profTela = folha(L, A);
  const cor = corTela.getContext("2d", { alpha: false })!;
  const prof = profTela.getContext("2d", { alpha: false })!;

  let vivo = true;
  let base: HTMLImageElement | null = null;
  let profBase: HTMLImageElement | null = null;
  const camadas = new Map<string, { cor: HTMLImageElement; prof: HTMLImageElement }>();
  let ativos = new Set<string>();
  let temImagem = false;

  const envia = (unidade: number, textura: WebGLTexture, fonte: HTMLCanvasElement, comMipmap: boolean) => {
    gl.activeTexture(gl.TEXTURE0 + unidade);
    gl.bindTexture(gl.TEXTURE_2D, textura);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, fonte);
    if (comMipmap && gl2) gl.generateMipmap(gl.TEXTURE_2D);
  };

  /** Redesenha a pintura e a profundidade com as camadas ligadas e manda para a placa de vídeo. */
  const compor = () => {
    if (!base || !profBase) return;
    cor.drawImage(base, 0, 0);
    prof.drawImage(profBase, 0, 0);
    for (const c of manifesto.camadas) {
      const img = camadas.get(c.id);
      if (!img || !ativos.has(c.id)) continue;
      cor.drawImage(img.cor, c.x, c.y);
      prof.drawImage(img.prof, c.x, c.y);
    }
    // a de agora vira a de antes; a nova entra na unidade 1
    [texAntes, texAgora] = [texAgora, texAntes];
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texAntes);
    envia(1, texAgora, corTela, true);
    envia(2, texProf, profTela, false);
    if (!temImagem) {
      // primeira vez: a de antes é igual à de agora
      envia(0, texAntes, corTela, true);
      temImagem = true;
    }
  };

  // ---- câmera, giro e onda ------------------------------------------------
  let largura = 1;
  let altura = 1;
  const cam = { x: L / 2, y: A / 2, z: 1 };
  const camAlvo = { x: L / 2, y: A / 2, z: 1 };
  const pivo = { h: 0.5, d: 0.5 };
  const pivoAlvo = { h: 0.5, d: 0.5 };
  const giro = { x: 0, y: 0 };
  const giroAlvo = { x: 0, y: 0 };
  let foco: string | null = null;
  let margemBase = 0;
  let onda = { x: L / 2, y: A / 2, raio: 0, ate: 0, forca: 0 };
  let luz = 0;
  let ultimoToque = -1e9;
  let naTela = true;
  let quadro = 0;
  let ultimo = 0;
  let inicio = 0;

  /** Enquadra o todo ou um cômodo. */
  const mirar = (imediato: boolean) => {
    // a área livre é o canvas menos a faixa de baixo; o centro dela fica acima do centro do canvas
    const livre = Math.max(80, altura - margemBase);
    const encaixe = Math.min(largura / L, livre / A);
    if (foco && manifesto.comodos[foco]) {
      const c = manifesto.comodos[foco];
      const [x0, y0, x1, y1] = c.caixa;
      const z = Math.min(largura / ((x1 - x0) * 1.22), livre / ((y1 - y0) * 1.22), encaixe * 2.7);
      camAlvo.z = Math.max(z, encaixe * 1.1);
      camAlvo.x = (x0 + x1) / 2;
      camAlvo.y = (y0 + y1) / 2 + margemBase / 2 / camAlvo.z;
      pivoAlvo.h = c.h;
      pivoAlvo.d = c.d;
    } else {
      // o todo: a maquete ocupa o miolo da pintura, então dá para chegar um pouco mais perto
      const z = Math.min(largura / (L * 0.9), livre / (A * 0.86));
      camAlvo.z = Math.max(z, encaixe);
      camAlvo.x = L / 2;
      camAlvo.y = A * 0.5 + margemBase / 2 / camAlvo.z;
      pivoAlvo.h = 0.5;
      pivoAlvo.d = 0.5;
    }
    if (imediato) {
      cam.x = camAlvo.x;
      cam.y = camAlvo.y;
      cam.z = camAlvo.z;
      pivo.h = pivoAlvo.h;
      pivo.d = pivoAlvo.d;
    }
    pedir();
  };

  const medir = () => {
    const r = tela.getBoundingClientRect();
    const antes = largura;
    largura = Math.max(1, r.width);
    altura = Math.max(1, r.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(largura * dpr);
    const h = Math.round(altura * dpr);
    if (tela.width !== w || tela.height !== h) {
      tela.width = w;
      tela.height = h;
    }
    mirar(antes <= 1);
  };

  let soBalanco = false;
  let pular = false;
  const desenhar = (agora: number) => {
    quadro = 0;
    if (!vivo || !temImagem) return;
    // quando só o balanço está rodando, desenha um quadro sim, um não: 30 por segundo bastam
    if (soBalanco && (pular = !pular)) {
      pedir();
      return;
    }
    if (!inicio) inicio = agora;
    const dt = Math.min(0.05, ultimo ? (agora - ultimo) / 1000 : 0.016);
    ultimo = agora;

    // balanço leve enquanto ninguém mexe: é ele que mostra que a maquete tem volume
    const parada = agora - ultimoToque;
    let alvoX = giroAlvo.x;
    let alvoY = giroAlvo.y;
    if (!opcoes.parado && parada > 2600) {
      const t = (agora - inicio) / 1000;
      const forca = Math.min(1, (parada - 2600) / 1500) * (foco ? 0.6 : 1);
      alvoX = Math.sin(t / 2.9) * 0.042 * forca;
      alvoY = Math.sin(t / 4.3 + 1.1) * 0.014 * forca;
    }
    giro.x = suave(giro.x, alvoX, dt, 0.16);
    giro.y = suave(giro.y, alvoY, dt, 0.16);
    cam.x = suave(cam.x, camAlvo.x, dt, 0.22);
    cam.y = suave(cam.y, camAlvo.y, dt, 0.22);
    cam.z = suave(cam.z, camAlvo.z, dt, 0.22);
    pivo.h = suave(pivo.h, pivoAlvo.h, dt, 0.22);
    pivo.d = suave(pivo.d, pivoAlvo.d, dt, 0.22);
    luz = Math.min(1, luz + dt / 0.6);
    if (onda.forca > 0) {
      onda.raio += dt * (700 + onda.raio * 2.4);
      if (onda.raio > onda.ate) onda.forca = 0;
    }

    gl.viewport(0, 0, tela.width, tela.height);
    gl.uniform1i(un.antes, 0);
    gl.uniform1i(un.agora, 1);
    gl.uniform1i(un.prof, 2);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texAntes);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texAgora);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, texProf);
    gl.uniform2f(un.tam, L, A);
    gl.uniform2f(un.tela, largura, altura);
    gl.uniform3f(un.cam, cam.x, cam.y, cam.z);
    gl.uniform2f(un.giro, giro.x, giro.y);
    gl.uniform3f(un.faixa, manifesto.faixa_h_px, manifesto.faixa_d_px, manifesto.sen_altura);
    gl.uniform2f(un.pivo, pivo.h, pivo.d);
    gl.uniform4f(un.onda, onda.x, onda.y, onda.raio, onda.forca);
    gl.uniform1f(un.luz, luz * luz * (3 - 2 * luz));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    cena.aoDesenhar?.();

    const camMexe = Math.abs(cam.x - camAlvo.x) > 0.3 || Math.abs(cam.y - camAlvo.y) > 0.3 || Math.abs(cam.z - camAlvo.z) > 0.0005;
    const giroMexe = Math.abs(giro.x - alvoX) > 0.0004 || Math.abs(giro.y - alvoY) > 0.0004;
    const trocando = onda.forca > 0 || luz < 1;
    // só o balanço rodando (ninguém mexeu há um tempo, câmera parada, sem troca): metade dos quadros
    soBalanco = !camMexe && !trocando && parada > 2600;
    if (camMexe || giroMexe || trocando || !opcoes.parado) pedir();
  };

  function pedir() {
    if (!vivo || quadro || !naTela || document.hidden) return;
    quadro = requestAnimationFrame(desenhar);
  }

  // ---- dedo e mouse -------------------------------------------------------
  let arrasto: { id: number; x: number; y: number; gx: number; gy: number } | null = null;
  const limita = (valor: number, max: number) => Math.max(-max, Math.min(max, valor));
  const aoMover = (e: PointerEvent) => {
    const r = tela.getBoundingClientRect();
    if (arrasto && e.pointerId === arrasto.id) {
      giroAlvo.x = limita(arrasto.gx + ((e.clientX - arrasto.x) / r.width) * 0.3, GIRO_MAX_X);
      giroAlvo.y = limita(arrasto.gy - ((e.clientY - arrasto.y) / r.height) * 0.16, GIRO_MAX_Y);
    } else if (e.pointerType === "mouse") {
      giroAlvo.x = ((e.clientX - r.left) / r.width - 0.5) * 2 * GIRO_MAX_X * 0.8;
      giroAlvo.y = (0.5 - (e.clientY - r.top) / r.height) * 2 * GIRO_MAX_Y * 0.8;
    } else return;
    ultimoToque = performance.now();
    pedir();
  };
  const aoDescer = (e: PointerEvent) => {
    arrasto = { id: e.pointerId, x: e.clientX, y: e.clientY, gx: giroAlvo.x, gy: giroAlvo.y };
    ultimoToque = performance.now();
  };
  const aoSubir = (e: PointerEvent) => {
    if (arrasto && e.pointerId === arrasto.id) arrasto = null;
  };
  tela.addEventListener("pointermove", aoMover);
  tela.addEventListener("pointerdown", aoDescer);
  window.addEventListener("pointerup", aoSubir);
  window.addEventListener("pointercancel", aoSubir);

  const aoPerder = (e: Event) => {
    e.preventDefault();
    vivo = false;
    opcoes.aoFalhar?.();
  };
  tela.addEventListener("webglcontextlost", aoPerder);

  const observaTamanho = new ResizeObserver(medir);
  observaTamanho.observe(tela);
  const observaTela = new IntersectionObserver(([e]) => {
    naTela = e.isIntersecting;
    if (naTela) {
      ultimo = 0;
      pedir();
    }
  });
  observaTela.observe(tela);
  const aoVoltar = () => {
    ultimo = 0;
    pedir();
  };
  document.addEventListener("visibilitychange", aoVoltar);

  // ---- carga: a base primeiro, as camadas depois --------------------------
  Promise.all([carregar(`${pasta}/base.webp`), carregar(`${pasta}/prof-base.webp`)])
    .then(([b, p]) => {
      if (!vivo) return;
      base = b;
      profBase = p;
      medir();
      compor();
      cena.aoChegar?.();
      pedir();
      return Promise.all(
        manifesto.camadas.map(async (c) => {
          const [imgCor, imgProf] = await Promise.all([carregar(`${pasta}/camada-${c.id}.webp`), carregar(`${pasta}/prof-${c.id}.webp`)]);
          camadas.set(c.id, { cor: imgCor, prof: imgProf });
        }),
      );
    })
    .then(() => {
      if (!vivo) return;
      // o que foi pedido antes de as camadas chegarem entra agora, sem onda
      if (ativos.size > 0) {
        compor();
        onda.forca = 0;
        pedir();
      }
    })
    .catch(() => {
      if (vivo) opcoes.aoFalhar?.();
    });

  const cena: CenaMaquete = {
    aoDesenhar: null,
    aoChegar: null,
    definir(lista, revelar) {
      const novo = new Set(lista);
      if (novo.size === ativos.size && [...novo].every((id) => ativos.has(id))) return;
      ativos = novo;
      if (!temImagem) return;
      compor();
      const c = revelar ? manifesto.camadas.find((k) => k.id === revelar) : null;
      if (c && !opcoes.parado) {
        const [x, y] = c.centro;
        const longe = Math.max(Math.hypot(x, y), Math.hypot(L - x, y), Math.hypot(x, A - y), Math.hypot(L - x, A - y));
        onda = { x, y, raio: 0, ate: longe + 140, forca: 1 };
      } else {
        onda.forca = 0;
      }
      pedir();
    },
    focar(comodo) {
      foco = comodo;
      mirar(false);
    },
    margem(base) {
      if (Math.abs(base - margemBase) < 1) return;
      margemBase = base;
      mirar(!temImagem);
    },
    projetar(x, y, h, d) {
      const px = x + (h - pivo.h) * manifesto.faixa_h_px * giro.x;
      const py = y + (x - cam.x) * manifesto.sen_altura * giro.x - (d - pivo.d) * manifesto.faixa_d_px * giro.y;
      return { x: (px - cam.x) * cam.z + largura / 2, y: (py - cam.y) * cam.z + altura / 2 };
    },
    destruir() {
      vivo = false;
      if (quadro) cancelAnimationFrame(quadro);
      observaTamanho.disconnect();
      observaTela.disconnect();
      document.removeEventListener("visibilitychange", aoVoltar);
      tela.removeEventListener("pointermove", aoMover);
      tela.removeEventListener("pointerdown", aoDescer);
      tela.removeEventListener("webglcontextlost", aoPerder);
      window.removeEventListener("pointerup", aoSubir);
      window.removeEventListener("pointercancel", aoSubir);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
  return cena;
}
