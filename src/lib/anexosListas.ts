import { supabase } from "@/integrations/supabase/client";
import { comprimirImagem, emParaleloOuFalha, isVideoFile, processFileForUpload } from "@/lib/fileUpload";
import { extensaoPorMime } from "@/lib/zipFileName";

/**
 * Fotos e vídeos das listas da equipe (ajustes, compras, tarefas de rua).
 *
 * Todos ficam no bucket privado `ajustes`, na pasta `<autor>/<id do item>/`,
 * e são lidos por URL assinada (migrations 20261016120000 e 20261017220000).
 * O nome original do arquivo nunca é usado (regra nº 4).
 */

export const BUCKET_LISTAS = "ajustes";
/** Por envio; o banco aceita até 10 por item. */
export const ANEXOS_POR_ENVIO = 6;
export const ANEXOS_MAX_ITEM = 10;
/** As URLs vencem em 1 h; o React Query refaz a busca ao voltar para a aba. */
const VALIDADE_URL_S = 60 * 60;

/** Os tipos que o bucket aceita (`allowed_mime_types`). */
const IMAGENS = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
const VIDEOS = ["video/mp4", "video/quicktime", "video/webm", "video/3gpp", "video/x-matroska"];
const ACEITOS = new Set([...IMAGENS, ...VIDEOS]);
const EXT_VIDEO: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", "3gp": "video/3gpp", mkv: "video/x-matroska" };

/** Pelo caminho gravado: "…/2-ab12.mp4" é vídeo. */
export function ehVideoCaminho(caminho: string): boolean {
  const ext = caminho.split(".").pop()?.toLowerCase() ?? "";
  return ext in EXT_VIDEO;
}

function tipoPorCaminho(caminho: string): string {
  const ext = caminho.split(".").pop()?.toLowerCase() ?? "";
  if (EXT_VIDEO[ext]) return EXT_VIDEO[ext];
  if (ext === "png" || ext === "webp" || ext === "gif" || ext === "heic" || ext === "heif") return `image/${ext}`;
  return "image/jpeg";
}

/** Alguns Android mandam "image/jpg" ou tipo vazio; o bucket recusaria. */
function tipoDoArquivo(arquivo: File): string {
  const tipo = (arquivo.type || "").toLowerCase();
  if (tipo === "image/jpg" || tipo === "image/pjpeg") return "image/jpeg";
  if (ACEITOS.has(tipo)) return tipo;
  const ext = (arquivo.name || "").split(".").pop()?.toLowerCase() ?? "";
  if (EXT_VIDEO[ext]) return EXT_VIDEO[ext];
  if (ACEITOS.has(`image/${ext}`)) return `image/${ext}`;
  return isVideoFile(arquivo) ? "video/mp4" : "image/jpeg";
}

/** Foto ou vídeo, pelo tipo ou pela extensão (Samsung manda tipo vazio). */
export function ehMidiaAceita(arquivo: File): boolean {
  return (
    (arquivo.type || "").startsWith("image/") ||
    isVideoFile(arquivo) ||
    /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(arquivo.name || "")
  );
}

/** UUID v4 também onde `crypto.randomUUID` não existe (WebView antiga, http). */
export function novoId(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  // randomUUID só existe em contexto seguro; getRandomValues existe em todo lugar.
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Sobe fotos (reduzidas no aparelho) e vídeos para a pasta do item.
 * Devolve os caminhos na ordem de entrada. Se um falhar, apaga os que subiram.
 * O sufixo aleatório deixa anexar de novo depois sem colidir com os antigos.
 */
export async function enviarAnexos(autorId: string, itemId: string, arquivos: File[]): Promise<string[]> {
  const enviados: string[] = [];
  try {
    return await emParaleloOuFalha(arquivos, async (original, indice) => {
      const arquivo = isVideoFile(original) ? await processFileForUpload(original) : await comprimirImagem(original);
      const tipo = tipoDoArquivo(arquivo);
      const ext = extensaoPorMime(tipo) ?? (tipo.startsWith("video/") ? "mp4" : "jpg");
      const sufixo = Math.random().toString(36).slice(2, 6);
      const caminho = `${autorId}/${itemId}/${indice + 1}-${sufixo}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET_LISTAS).upload(caminho, arquivo, { contentType: tipo, upsert: false });
      if (error) throw error;
      enviados.push(caminho);
      return caminho;
    });
  } catch (erro) {
    if (enviados.length > 0) await supabase.storage.from(BUCKET_LISTAS).remove(enviados);
    throw erro;
  }
}

export async function removerAnexos(caminhos: string[]): Promise<void> {
  if (caminhos.length > 0) await supabase.storage.from(BUCKET_LISTAS).remove(caminhos);
}

/** URL assinada de cada caminho (as que falharem ficam de fora do mapa). */
export async function assinarAnexos(caminhos: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (caminhos.length === 0) return mapa;
  const { data, error } = await supabase.storage.from(BUCKET_LISTAS).createSignedUrls(caminhos, VALIDADE_URL_S);
  if (error) {
    console.warn("[anexos] não foi possível assinar:", error.message);
    return mapa;
  }
  for (const item of data ?? []) if (item.path && item.signedUrl) mapa.set(item.path, item.signedUrl);
  return mapa;
}

/** Itens para a MediaGallery, com nome anônimo ("Foto 1", "Vídeo 2"). */
export function itensGaleria(caminhos: string[], urls: (string | null)[]) {
  return caminhos.flatMap((caminho, i) => {
    const url = urls[i];
    if (!url) return [];
    const video = ehVideoCaminho(caminho);
    return [{ id: caminho, file_url: url, file_name: `${video ? "Vídeo" : "Foto"} ${i + 1}`, file_type: tipoPorCaminho(caminho) }];
  });
}

/** Mensagem amigável para falha de envio de anexo. */
export function erroDeAnexo(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : String(erro ?? "");
  if ((erro as { code?: string })?.code === "VIDEO_TOO_LARGE" || /muito pesado/i.test(texto))
    return "O vídeo é grande demais (até 100 MB). Grave um trecho mais curto.";
  if (/mime|type .* not supported/i.test(texto)) return "Esse formato não é aceito. Envie foto (JPG, PNG) ou vídeo (MP4, MOV).";
  if (/size|too large|exceed/i.test(texto)) return "Um dos arquivos é grande demais (até 100 MB).";
  return "Não foi possível enviar. Confira a internet e tente de novo.";
}
