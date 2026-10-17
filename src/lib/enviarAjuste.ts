import { tabelaAjustes } from "@/hooks/useAjustes";
import { enviarAnexos, novoId, removerAnexos } from "@/lib/anexosListas";
import type { CategoriaAjuste } from "@/lib/ajusteMeta";

export interface NovoAjuste {
  autorId: string;
  /** null = geral ou imóvel fora da lista. */
  propertyId: string | null;
  categoria: CategoriaAjuste;
  descricao: string;
  urgente: boolean;
  /** Fotos e vídeos. */
  fotos: File[];
}

/**
 * Sobe as fotos e vídeos (fotos reduzidas no aparelho) e grava o aviso.
 * O id nasce aqui para os arquivos irem direto para a pasta do aviso; se a
 * gravação falhar, os que já subiram são apagados.
 */
export async function enviarAjuste(novo: NovoAjuste): Promise<string> {
  const id = novoId();
  const fotos = await enviarAnexos(novo.autorId, id, novo.fotos);
  const { error } = await tabelaAjustes().insert({
    id,
    property_id: novo.propertyId,
    categoria: novo.categoria,
    descricao: novo.descricao.trim(),
    urgente: novo.urgente,
    fotos,
  });
  if (error) {
    await removerAnexos(fotos);
    throw error;
  }
  return id;
}
