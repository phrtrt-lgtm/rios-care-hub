/**
 * Toca vídeo com fundo transparente em qualquer navegador.
 *
 * O WebM com alfa não toca no iPhone, então os clipes do Mini Paulo são MP4
 * comuns "empilhados": a metade de cima do quadro é a cor (já multiplicada
 * pela máscara) e a de baixo é a máscara em tons de cinza. Aqui um canvas
 * WebGL junta as duas metades a cada quadro. Não usa three.js nem nada de
 * fora: são um triângulo, uma textura e um shader de cinco linhas.
 *
 * Os clipes saem de `motion/paulo-filme/preparar.py`.
 */

export interface OpcoesDoClipe {
  /** Repete sem parar (o clipe de descanso). */
  laco?: boolean;
  /** Tamanho na caixa, com o pé preso embaixo (os closes entram um pouco menores). */
  escala?: number;
  /** O primeiro quadro do clipe apareceu. */
  aoComecar?: () => void;
  /** Um clipe que não é laço chegou ao fim. */
  aoTerminar?: () => void;
}

export interface TocadorComAlfa {
  tocar(url: string, opcoes?: OpcoesDoClipe): void;
  /** Deixa um clipe baixando para a troca ser na hora. */
  preparar(url: string): void;
  pausar(): void;
  retomar(): void;
  destruir(): void;
}

const VERTICE = `
attribute vec2 p;
uniform float e;
varying vec2 v;
void main() {
  v = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  // encolhe em volta do meio da base: o Paulo fica sempre apoiado embaixo
  gl_Position = vec4(p.x * e, (p.y + 1.0) * e - 1.0, 0.0, 1.0);
}`;

const FRAGMENTO = `
precision mediump float;
uniform sampler2D t;
varying vec2 v;
void main() {
  // fora do quadro do clipe (ele pode entrar encolhido) não há nada: sem isto a borda se repetia em risco
  if (v.x < 0.0 || v.x > 1.0 || v.y < 0.0 || v.y > 1.0) discard;
  // meio pixel de folga para uma metade não vazar na outra
  float y = clamp(v.y, 0.003, 0.997) * 0.5;
  vec3 cor = texture2D(t, vec2(v.x, y)).rgb;
  float a = smoothstep(0.03, 0.97, texture2D(t, vec2(v.x, y + 0.5)).r);
  gl_FragColor = vec4(min(cor, vec3(a)), a);
}`;

function compilar(gl: WebGLRenderingContext, tipo: number, fonte: string): WebGLShader | null {
  const s = gl.createShader(tipo);
  if (!s) return null;
  gl.shaderSource(s, fonte);
  gl.compileShader(s);
  return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
}

/** Devolve null se o aparelho não desenha WebGL: quem chama fica com a imagem parada. */
export function criarTocadorComAlfa(tela: HTMLCanvasElement): TocadorComAlfa | null {
  const gl = tela.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "low-power" });
  if (!gl) return null;

  const vs = compilar(gl, gl.VERTEX_SHADER, VERTICE);
  const fs = compilar(gl, gl.FRAGMENT_SHADER, FRAGMENTO);
  const programa = gl.createProgram();
  if (!vs || !fs || !programa) return null;
  gl.attachShader(programa, vs);
  gl.attachShader(programa, fs);
  gl.linkProgram(programa);
  if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) return null;
  gl.useProgram(programa);

  // um triângulo só, maior que a tela, no lugar de dois
  const quadro = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadro);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const lugarP = gl.getAttribLocation(programa, "p");
  gl.enableVertexAttribArray(lugarP);
  gl.vertexAttribPointer(lugarP, 2, gl.FLOAT, false, 0, 0);
  const lugarEscala = gl.getUniformLocation(programa, "e");

  const textura = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, textura);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.clearColor(0, 0, 0, 0);

  const videos = new Map<string, HTMLVideoElement>();
  /** Endereços locais dos clipes baixados, para devolver a memória ao sair. */
  const baixados: string[] = [];
  let atual: HTMLVideoElement | null = null;
  let opcoesAtuais: OpcoesDoClipe = {};
  let proximo: HTMLVideoElement | null = null;
  let ultimoTempo = -1;
  let quadroId = 0;
  let pausado = false;
  let destruido = false;

  function video(url: string): HTMLVideoElement {
    let v = videos.get(url);
    if (!v) {
      v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      v.disableRemotePlayback = true;
      v.setAttribute("aria-hidden", "true");
      // fora da tela, mas no documento: o iPhone só decodifica vídeo que está na página
      v.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;";
      tela.parentElement?.appendChild(v);
      videos.set(url, v);
      // O clipe é baixado inteiro e tocado da memória. O servidor do portal responde o arquivo todo a um
      // pedido de trecho (200 no lugar de 206), e o iPhone costuma recusar vídeo de servidor assim; da
      // memória ele toca. Os clipes são pequenos (200 a 400 kB), então não se perde nada.
      const elemento = v;
      fetch(url)
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
        .then((arquivo) => {
          if (destruido) return;
          const local = URL.createObjectURL(arquivo);
          baixados.push(local);
          elemento.src = local;
          if (proximo === elemento && !pausado) void elemento.play().catch(() => undefined);
        })
        .catch(() => {
          // sem rede: o clipe não toca e quem chama fica com o quadro parado
        });
    }
    return v;
  }

  function medir() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const l = Math.round(tela.clientWidth * dpr);
    const a = Math.round(tela.clientHeight * dpr);
    if (l && a && (tela.width !== l || tela.height !== a)) {
      tela.width = l;
      tela.height = a;
      ultimoTempo = -1;
    }
    gl!.viewport(0, 0, tela.width, tela.height);
  }

  function desenhar(v: HTMLVideoElement) {
    medir();
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, v);
    gl!.uniform1f(lugarEscala, opcoesAtuais.escala ?? 1);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  function laco() {
    quadroId = 0;
    if (destruido || pausado) return;
    // o clipe pedido só assume quando já tem quadro para mostrar: até lá o anterior continua na tela
    if (proximo && proximo.readyState >= 2 && !proximo.paused && proximo.currentTime > 0) {
      if (atual && atual !== proximo) atual.pause();
      atual = proximo;
      proximo = null;
      ultimoTempo = -1;
      opcoesAtuais.aoComecar?.();
    }
    if (atual && atual.readyState >= 2 && atual.currentTime !== ultimoTempo) {
      ultimoTempo = atual.currentTime;
      try {
        desenhar(atual);
      } catch {
        // quadro ainda não disponível para a placa de vídeo: tenta no próximo
      }
    }
    quadroId = requestAnimationFrame(laco);
  }

  function pedirLaco() {
    if (!quadroId && !destruido && !pausado) quadroId = requestAnimationFrame(laco);
  }

  function aoAcabar(e: Event) {
    if (e.target === atual && !opcoesAtuais.laco) opcoesAtuais.aoTerminar?.();
  }

  return {
    preparar(url) {
      video(url);
    },
    tocar(url, opcoes = {}) {
      if (destruido) return;
      const v = video(url);
      opcoesAtuais = opcoes;
      v.loop = !!opcoes.laco;
      v.removeEventListener("ended", aoAcabar);
      v.addEventListener("ended", aoAcabar);
      try {
        v.currentTime = 0;
      } catch {
        // ainda sem metadados: começa do zero de qualquer jeito
      }
      proximo = v;
      if (!pausado) void v.play().catch(() => undefined);
      pedirLaco();
    },
    pausar() {
      pausado = true;
      atual?.pause();
      proximo?.pause();
      cancelAnimationFrame(quadroId);
      quadroId = 0;
    },
    retomar() {
      if (!pausado || destruido) return;
      pausado = false;
      const v = proximo ?? atual;
      if (v && !v.ended) void v.play().catch(() => undefined);
      pedirLaco();
    },
    destruir() {
      destruido = true;
      cancelAnimationFrame(quadroId);
      for (const v of videos.values()) {
        v.pause();
        v.removeEventListener("ended", aoAcabar);
        v.removeAttribute("src");
        v.load();
        v.remove();
      }
      videos.clear();
      for (const local of baixados) URL.revokeObjectURL(local);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
