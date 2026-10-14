// Anexos nas conversas: o que é foto/vídeo (vai para o mosaico), o que é
// arquivo (fica como cartão) e como juntar várias mensagens só de mídia do
// mesmo autor num mosaico único. Compartilhado pelos chats que usam o kit.
import { detectMediaKind, resolveMimeType } from "@/lib/mediaType";

export interface AnexoChat {
  id: string;
  file_url: string;
  file_name?: string | null;
  file_type?: string | null;
  size_bytes?: number | null;
}

/** Foto ou vídeo que o navegador mostra direto. TIFF não abre e fica como arquivo. */
export function ehMidiaVisual(anexo: AnexoChat): boolean {
  const mime = resolveMimeType(anexo.file_type, anexo.file_name, anexo.file_url);
  if (mime === "image/tiff" || mime === "image/tif") return false;
  const tipo = detectMediaKind(mime, anexo.file_name, anexo.file_url);
  return tipo === "image" || tipo === "video";
}

export function separarAnexos<T extends AnexoChat>(anexos: T[]): { midias: T[]; arquivos: T[] } {
  const midias: T[] = [];
  const arquivos: T[] = [];
  for (const a of anexos) (ehMidiaVisual(a) ? midias : arquivos).push(a);
  return { midias, arquivos };
}

// Texto gravado junto com anexo só para a mensagem não ficar vazia
// ("Anexo enviado" nos envios rápidos, "(anexos)" nas cobranças). Com o
// mosaico na tela ele não acrescenta nada e sai.
const CORPO_DE_ANEXO = /^(anexos?\s+enviados?!?|\(anexos?\))$/i;

export function ehCorpoDeAnexo(body: string | null | undefined): boolean {
  const texto = (body ?? "").trim();
  return texto === "" || CORPO_DE_ANEXO.test(texto);
}

export interface GrupoMensagem<T> {
  /** Primeira mensagem: autor, avatar e posição no dia. */
  primeira: T;
  /** Última: hora, recibo de leitura e estado de envio. */
  ultima: T;
  membros: T[];
  anexos: AnexoChat[];
  /** Só fotos/vídeos, sem texto: vira um mosaico único. */
  soMidia: boolean;
}

export interface LeitorDeMensagem<T> {
  autorId: (m: T) => string | null | undefined;
  criadoEm: (m: T) => string;
  corpo: (m: T) => string | null | undefined;
  anexos: (m: T) => AnexoChat[] | undefined;
  /** Nota interna e mensagem pública nunca vão para o mesmo mosaico. */
  interna?: (m: T) => boolean;
}

/**
 * Junta, em sequência, mensagens só de mídia do mesmo autor enviadas dentro
 * da janela (os envios rápidos gravam uma mensagem por arquivo). Mensagem com
 * texto nunca se junta: o texto fica acima do próprio mosaico.
 */
export function juntarMensagensDeMidia<T>(
  mensagens: T[],
  ler: LeitorDeMensagem<T>,
  janelaMs = 3 * 60 * 1000,
): GrupoMensagem<T>[] {
  const grupos: GrupoMensagem<T>[] = [];
  for (const m of mensagens) {
    const anexos = ler.anexos(m) ?? [];
    const soMidia = anexos.length > 0 && ehCorpoDeAnexo(ler.corpo(m)) && anexos.every(ehMidiaVisual);
    const anterior = grupos[grupos.length - 1];
    const mesmoAutor = !!anterior && ler.autorId(anterior.ultima) === ler.autorId(m);
    const mesmaVisibilidade = !!anterior && (ler.interna?.(anterior.ultima) ?? false) === (ler.interna?.(m) ?? false);
    const perto =
      !!anterior &&
      new Date(ler.criadoEm(m)).getTime() - new Date(ler.criadoEm(anterior.ultima)).getTime() < janelaMs;
    if (soMidia && anterior?.soMidia && mesmoAutor && mesmaVisibilidade && perto) {
      anterior.ultima = m;
      anterior.membros.push(m);
      anterior.anexos.push(...anexos);
      continue;
    }
    grupos.push({ primeira: m, ultima: m, membros: [m], anexos: [...anexos], soMidia });
  }
  return grupos;
}
