import { supabase } from "@/integrations/supabase/client";
import { comprimirImagem, emParaleloOuFalha } from "@/lib/fileUpload";
import { extensaoPorMime } from "@/lib/zipFileName";
import { BUCKET_AJUSTES, tabelaAjustes } from "@/hooks/useAjustes";
import type { CategoriaAjuste } from "@/lib/ajusteMeta";

export interface NovoAjuste {
  autorId: string;
  /** null = geral ou imóvel fora da lista. */
  propertyId: string | null;
  categoria: CategoriaAjuste;
  descricao: string;
  urgente: boolean;
  fotos: File[];
}

/** Os tipos que o bucket aceita (`allowed_mime_types` na migration). */
const TIPOS_ACEITOS = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"]);

/** Alguns Android mandam "image/jpg" ou tipo vazio; o bucket recusaria. */
function tipoDaFoto(foto: File): string {
  const tipo = (foto.type || "").toLowerCase();
  if (tipo === "image/jpg" || tipo === "image/pjpeg") return "image/jpeg";
  if (TIPOS_ACEITOS.has(tipo)) return tipo;
  const ext = (foto.name || "").split(".").pop()?.toLowerCase();
  if (ext && TIPOS_ACEITOS.has(`image/${ext}`)) return `image/${ext}`;
  return "image/jpeg";
}

/** UUID v4 também onde `crypto.randomUUID` não existe (WebView antiga, http). */
function novoId(): string {
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
 * Sobe as fotos (reduzidas no aparelho) e grava o aviso.
 *
 * O id nasce aqui para as fotos irem direto para a pasta do aviso
 * (`<autor>/<aviso>/1.jpg`); o nome do arquivo original nunca é usado
 * (regra nº 4). Se a gravação falhar, as fotos já enviadas são apagadas.
 */
export async function enviarAjuste(novo: NovoAjuste): Promise<string> {
  const id = novoId();
  const enviadas: string[] = [];

  try {
    const fotos = await emParaleloOuFalha(novo.fotos, async (original, indice) => {
      const foto = await comprimirImagem(original);
      const tipo = tipoDaFoto(foto);
      const caminho = `${novo.autorId}/${id}/${indice + 1}.${extensaoPorMime(tipo) ?? "jpg"}`;
      const { error } = await supabase.storage
        .from(BUCKET_AJUSTES)
        .upload(caminho, foto, { contentType: tipo, upsert: false });
      if (error) throw error;
      enviadas.push(caminho);
      return caminho;
    });

    const { error } = await tabelaAjustes().insert({
      id,
      property_id: novo.propertyId,
      categoria: novo.categoria,
      descricao: novo.descricao.trim(),
      urgente: novo.urgente,
      fotos,
    });
    if (error) throw error;
    return id;
  } catch (erro) {
    if (enviadas.length > 0) await supabase.storage.from(BUCKET_AJUSTES).remove(enviadas);
    throw erro;
  }
}
