// Curadoria em HTML: a proposta decorativa gerada pela skill proposta-decorativa, hospedada no portal.
// É uma linha de owner_curations com html_path preenchido; o arquivo fica no bucket `curadorias`.
import { supabase } from "@/integrations/supabase/client";
import { linkWhatsapp } from "@/lib/viabilizacaoMeta";
import { portalLink } from "@/lib/portalUrl";

export const BUCKET_CURADORIAS = "curadorias";
export const MAX_ARQUIVO_CURADORIA = 30 * 1024 * 1024;

/** Cliente sem tipos até o types.ts ter as colunas novas e a RPC curadoria_por_link. */
const semTipos = supabase as unknown as {
  from: (tabela: string) => any;
  rpc: (nome: string, args: Record<string, unknown>) => any;
};
export const tabelaCuradorias = () => semTipos.from("owner_curations");

export const COLUNAS_HTML = "html_path, link_token, pecas, aberturas, primeira_abertura_em, ultima_abertura_em, property_id";

export interface CuradoriaAberta {
  titulo: string;
  html_path: string;
  imovel: string | null;
}

/** Busca pelo token do link. Rascunho só volta para a equipe; quem não é da equipe conta como abertura. */
export async function abrirCuradoriaPorLink(token: string): Promise<CuradoriaAberta | null> {
  const { data, error } = await semTipos.rpc("curadoria_por_link", { p_token: token });
  if (error) throw error;
  return (data?.[0] as CuradoriaAberta | undefined) ?? null;
}

export function urlDoArquivo(path: string): string {
  return supabase.storage.from(BUCKET_CURADORIAS).getPublicUrl(path).data.publicUrl;
}

export const linkCuradoria = (token: string) => portalLink(`/curadoria/${token}`);

/** 128 bits em base64url: o link é a chave de quem não tem login. */
export function gerarTokenCuradoria(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface DadosDoArquivo {
  nome: string;
  pecas: number;
  totalCents: number;
}

/** Lê o JSON que a skill grava na página: nome do imóvel, quantidade de peças e total no Pix. */
export function lerDadosDoArquivo(html: string): DadosDoArquivo | null {
  const achado = html.match(/<script id="dados" type="application\/json">([\s\S]*?)<\/script>/);
  if (!achado) return null;
  try {
    const dados = JSON.parse(achado[1]) as { nome?: string; itens?: Record<string, { pix?: number }> };
    const itens = Object.values(dados.itens ?? {});
    if (!dados.nome || itens.length === 0) return null;
    const total = itens.reduce((soma, i) => soma + (i.pix ?? 0), 0);
    return { nome: dados.nome, pecas: itens.length, totalCents: Math.round(total * 100) };
  } catch {
    return null;
  }
}

/** Sobe uma versão nova do arquivo. Cada versão tem caminho próprio porque o endereço público fica em cache. */
export async function enviarArquivoCuradoria(token: string, arquivo: File): Promise<string> {
  const caminho = `${token}/${Date.now()}.html`;
  const { error } = await supabase.storage.from(BUCKET_CURADORIAS).upload(caminho, arquivo, {
    contentType: "text/html",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;
  return caminho;
}

/** Abre a conversa do proprietário com o link no texto. Quem envia é a pessoa da equipe. */
export function whatsappDaCuradoria(opcoes: {
  telefone: string | null | undefined;
  nomeProprietario: string | null | undefined;
  imovel: string | null | undefined;
  token: string;
}): string | null {
  const base = linkWhatsapp(opcoes.telefone);
  if (!base) return null;
  const primeiroNome = (opcoes.nomeProprietario ?? "").trim().split(/\s+/)[0];
  const texto = [
    `Olá${primeiroNome ? `, ${primeiroNome}` : ""}! Preparamos uma proposta de decoração${opcoes.imovel ? ` para o ${opcoes.imovel}` : " para o seu imóvel"}.`,
    "Dá para ver peça por peça, com a foto de cada ambiente, e escolher o que quiser:",
    linkCuradoria(opcoes.token),
  ].join("\n");
  return `${base}?text=${encodeURIComponent(texto)}`;
}
