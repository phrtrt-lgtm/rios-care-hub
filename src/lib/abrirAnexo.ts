// Anexos servidos pela function serve-attachment exigem o token da sessão:
// um link direto (<a href>, window.open) chega sem ele e a function devolve
// 401 "Unauthorized". Aqui o arquivo é baixado com o token e vira um blob
// local, que o navegador abre ou salva normalmente. Funciona também com URL
// pública do storage.
import { supabase } from "@/integrations/supabase/client";
import { extensaoPorMime, nomeAnexoAnonimo } from "@/lib/zipFileName";

export async function buscarAnexoAutenticado(url: string): Promise<Blob | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(url, {
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
  });
  if (!res.ok) return null;
  return res.blob();
}

/**
 * Abre o anexo numa aba nova. A aba é aberta antes do fetch (no clique),
 * senão o bloqueador de pop-up do navegador a recusa.
 */
export async function abrirAnexoAutenticado(url: string): Promise<boolean> {
  const aba = window.open("", "_blank");
  const blob = await buscarAnexoAutenticado(url);
  if (!blob) {
    aba?.close();
    return false;
  }
  const blobUrl = URL.createObjectURL(blob);
  if (aba) aba.location.href = blobUrl;
  else window.open(blobUrl, "_blank");
  return true;
}

/** Salva o anexo com nome anônimo ("anexo-01.pdf"; regra nº 4 do CLAUDE.md). */
export async function baixarAnexoAutenticado(url: string, indice: number, mime?: string | null): Promise<boolean> {
  const blob = await buscarAnexoAutenticado(url);
  if (!blob) return false;
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = nomeAnexoAnonimo(indice, extensaoPorMime(blob.type || mime));
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  return true;
}
