import { capaGrande, pct, reais } from "@/lib/resultadosImovel";
import type { ResumoMes } from "@/lib/resumoDoMes";

/**
 * Cartão do resumo do mês para compartilhar (WhatsApp, redes): uma imagem
 * 1080 × 1350 desenhada em canvas, com a foto do imóvel, os números do mês e a
 * marca. Os valores em reais só entram se a pessoa pedir: quem compartilha
 * decide se mostra quanto o imóvel rendeu.
 */

const L = 1080;
const A = 1350;

function token(nome: string, alfa = 1): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  return `hsl(${v} / ${alfa})`;
}

function carregar(src: string, externa = false): Promise<HTMLImageElement | null> {
  return new Promise((resolver) => {
    const img = new Image();
    // Foto do CDN do anúncio: sem CORS o canvas fica "sujo" e não exporta.
    if (externa) img.crossOrigin = "anonymous";
    img.onload = () => resolver(img);
    img.onerror = () => resolver(null);
    img.src = src;
  });
}

/** Desenha a imagem cobrindo a caixa inteira, cortando o excesso pelo centro. */
function cobrir(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const escala = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / escala;
  const sh = h / escala;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

/** A logo é azul sobre transparente; sobre o fundo escuro ela vai em branco. */
function logoBranca(logo: HTMLImageElement, altura: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.height = altura;
  c.width = Math.round((logo.naturalWidth / logo.naturalHeight) * altura);
  const x = c.getContext("2d")!;
  x.drawImage(logo, 0, 0, c.width, c.height);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = "#fff";
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

function fonte(peso: number, tamanho: number): string {
  return `${peso} ${tamanho}px Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
}

/** Reduz o corpo até o texto caber na largura. */
function escreverCabendo(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number, largura: number, peso: number, tamanho: number) {
  let t = tamanho;
  ctx.font = fonte(peso, t);
  while (ctx.measureText(texto).width > largura && t > 28) {
    t -= 2;
    ctx.font = fonte(peso, t);
  }
  ctx.fillText(texto, x, y);
}

export interface OpcoesCartao {
  resumo: ResumoMes;
  imovel: { nome: string; capa: string | null };
  comValores: boolean;
}

export async function gerarCartaoDoResumo({ resumo, imovel, comValores }: OpcoesCartao): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = L;
  canvas.height = A;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Este aparelho não conseguiu montar a imagem.");

  try {
    await document.fonts?.ready;
  } catch {
    // segue com a fonte do sistema
  }

  const capa = capaGrande(imovel.capa, 1200);
  const [foto, logo, paulo] = await Promise.all([
    capa ? carregar(capa, true) : Promise.resolve(null),
    carregar("/logo.png"),
    carregar("/resumo/paulo-joinha.webp"),
  ]);

  // Fundo
  ctx.fillStyle = token("--rios-blue-deep");
  ctx.fillRect(0, 0, L, A);

  // Foto no topo, sumindo para o azul
  const ALTURA_FOTO = 640;
  if (foto) {
    cobrir(ctx, foto, 0, 0, L, ALTURA_FOTO);
    const g = ctx.createLinearGradient(0, 0, 0, ALTURA_FOTO);
    g.addColorStop(0, token("--rios-blue-deep", 0.55));
    g.addColorStop(0.35, token("--rios-blue-deep", 0.05));
    g.addColorStop(0.72, token("--rios-blue-deep", 0.55));
    g.addColorStop(1, token("--rios-blue-deep", 1));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, L, ALTURA_FOTO + 2);
  } else {
    const g = ctx.createLinearGradient(0, 0, L, ALTURA_FOTO);
    g.addColorStop(0, token("--rios-blue", 0.55));
    g.addColorStop(1, token("--rios-blue-deep", 1));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, L, ALTURA_FOTO);
  }

  // Marca
  if (logo) ctx.drawImage(logoBranca(logo, 62), 64, 60);

  // Título
  const X = 72;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = token("--rios-terra-light");
  ctx.font = fonte(700, 30);
  ctx.fillText(`RESUMO DE ${resumo.mes.nomeComAno.toUpperCase()}`, X, 600);
  ctx.fillStyle = "#fff";
  escreverCabendo(ctx, imovel.nome, X, 680, L - X * 2, 700, 72);

  // Números
  const linhas: { valor: string; rotulo: string }[] = [
    { valor: String(resumo.noites), rotulo: `de ${resumo.disponiveis} noites reservadas` },
    { valor: pct(resumo.ocupacao), rotulo: "de ocupação" },
  ];
  if (comValores) {
    linhas.push({ valor: reais(resumo.receita), rotulo: "em diárias" });
  } else if (resumo.hospedes != null) {
    linhas.push({ valor: String(resumo.hospedes), rotulo: resumo.hospedes === 1 ? "hóspede recebido" : "hóspedes recebidos" });
  } else {
    linhas.push({ valor: String(resumo.reservas), rotulo: resumo.reservas === 1 ? "reserva" : "reservas" });
  }

  const LARGURA_TEXTO = paulo ? 600 : L - X * 2;
  let y = 830;
  for (const l of linhas) {
    ctx.fillStyle = "#fff";
    escreverCabendo(ctx, l.valor, X, y, LARGURA_TEXTO, 700, 104);
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.font = fonte(500, 32);
    ctx.fillText(l.rotulo, X, y + 46);
    y += 168;
  }

  // Mini Paulo, de meio corpo, saindo do canto
  if (paulo) {
    const h = 600;
    const w = (paulo.naturalWidth / paulo.naturalHeight) * h;
    ctx.drawImage(paulo, L - w - 28, A - h, w, h);
  }

  // Rodapé, em duas linhas para não encostar no Paulo
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = fonte(600, 26);
  ctx.fillText("Gestão RIOS Hospedagens", X, A - 84);
  ctx.fillStyle = "rgba(255,255,255,0.62)";
  ctx.font = fonte(500, 24);
  ctx.fillText("rioshospedagens.com.br", X, A - 48);

  return new Promise((resolver, rejeitar) => {
    canvas.toBlob((b) => (b ? resolver(b) : rejeitar(new Error("Não foi possível gerar a imagem."))), "image/png");
  });
}

export function nomeDoArquivo(resumo: ResumoMes, imovel: { nome: string }): string {
  const limpo = imovel.nome
    .normalize("NFD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
  return `resumo-${resumo.mes.chave}-${limpo || "imovel"}.png`;
}

/** O aparelho abre a folha de compartilhar com arquivo? (celular; no computador quase nunca) */
export function podeCompartilharArquivo(arquivo: File): boolean {
  try {
    return typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [arquivo] });
  } catch {
    return false;
  }
}

export function baixarImagem(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
