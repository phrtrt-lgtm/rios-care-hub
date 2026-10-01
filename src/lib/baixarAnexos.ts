import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { emParalelo } from "@/lib/fileUpload";
import { fetchChargeGalleryAttachments } from "@/lib/chargeAttachments";
import { buildZipEntryNameFromBlob } from "@/lib/zipFileName";

/** Um item (manutenção ou cobrança) cujos anexos vão para uma pasta do ZIP. */
export interface PacoteAnexos {
  /** id do ticket de manutenção, quando o item é (ou nasceu de) um ticket */
  ticketId?: string | null;
  /** id da cobrança, quando o item é uma cobrança */
  chargeId?: string | null;
  /** Check-out do hóspede (coluna DATE, "aaaa-mm-dd") */
  checkout?: string | null;
  imovel?: string | null;
  /** Nome do dano / título da manutenção */
  dano?: string | null;
}

interface AnexoParaBaixar {
  file_url: string;
  file_name?: string | null;
  file_type?: string | null;
}

/** Tira o que o Windows não aceita em nome de arquivo e encurta. */
function limparParaNome(texto: string | null | undefined, maximo = 60): string {
  return (texto || "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, maximo)
    .trim();
}

/**
 * Nome organizado do pacote: "Check-out 2026-09-14 - Imóvel - Dano".
 * A data vai em ano-mês-dia para as pastas ficarem em ordem ao extrair.
 */
export function nomePacoteAnexos(p: Pick<PacoteAnexos, "checkout" | "imovel" | "dano">): string {
  const data = /^\d{4}-\d{2}-\d{2}/.exec(p.checkout || "")?.[0];
  const partes = [
    data ? `Check-out ${data}` : "Sem check-out",
    limparParaNome(p.imovel, 50) || "Imóvel",
    limparParaNome(p.dano, 70) || "Manutenção",
  ];
  return partes.join(" - ");
}

const urlDoStorage = (bruto: string) => {
  if (!bruto) return bruto;
  if (/^https?:\/\//.test(bruto)) return bruto;
  return supabase.storage.from("attachments").getPublicUrl(bruto).data.publicUrl;
};

/**
 * Todos os anexos de um item: os da cobrança (com os do ticket de origem como
 * reserva) ou, na manutenção, os presos ao ticket e às mensagens dele.
 */
async function listarAnexos(p: PacoteAnexos): Promise<AnexoParaBaixar[]> {
  if (p.chargeId) {
    const porCobranca = await fetchChargeGalleryAttachments([{ id: p.chargeId, ticket_id: p.ticketId }]);
    const lista = porCobranca[p.chargeId] || [];
    if (lista.length > 0 || !p.ticketId) return lista;
  }
  if (!p.ticketId) return [];

  const campos = "id, file_url, path, file_name, file_type, mime_type, created_at";
  const [{ data: diretos, error }, { data: mensagens }] = await Promise.all([
    supabase.from("ticket_attachments").select(campos).eq("ticket_id", p.ticketId),
    supabase.from("ticket_messages").select("id").eq("ticket_id", p.ticketId),
  ]);
  if (error) throw error;

  let deMensagens: any[] = [];
  const idsMensagens = (mensagens || []).map((m) => m.id);
  if (idsMensagens.length > 0) {
    const { data } = await supabase.from("ticket_attachments").select(campos).in("message_id", idsMensagens);
    deMensagens = data || [];
  }

  const unicos = new Map<string, any>();
  [...(diretos || []), ...deMensagens].forEach((a: any) => unicos.set(a.id, a));
  return Array.from(unicos.values())
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((a) => ({
      file_url: urlDoStorage(a.file_url || a.path || ""),
      file_name: a.file_name,
      file_type: a.file_type || a.mime_type,
    }));
}

async function baixarArquivo(url: string): Promise<Blob> {
  const partes = new URL(url).pathname.split("/object/public/");
  if (partes.length === 2) {
    const [bucket, ...resto] = partes[1].split("/");
    const { data, error } = await supabase.storage.from(bucket).download(decodeURIComponent(resto.join("/")));
    if (!error && data) return data;
  }
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`Falha ao baixar (${resposta.status})`);
  return resposta.blob();
}

export interface ResultadoDownloadAnexos {
  /** Arquivos que entraram no ZIP */
  baixados: number;
  /** Arquivos que não puderam ser baixados */
  falhas: number;
  /** Itens que não tinham anexo nenhum */
  semAnexo: number;
}

/**
 * Baixa os anexos de um ou mais itens num único .zip. Cada item vira uma pasta
 * com o nome organizado (check-out, imóvel, dano); dentro dela os arquivos são
 * "anexo-01.jpg", "anexo-02.mp4"… — o nome real do arquivo não sai (regra nº 4).
 * Com um item só, o .zip leva o mesmo nome da pasta.
 */
export async function baixarAnexosEmZip(pacotes: PacoteAnexos[]): Promise<ResultadoDownloadAnexos> {
  const zip = new JSZip();
  const resultado: ResultadoDownloadAnexos = { baixados: 0, falhas: 0, semAnexo: 0 };
  const nomesUsados = new Map<string, number>();

  for (const pacote of pacotes) {
    const anexos = (await listarAnexos(pacote)).filter((a) => a.file_url);
    if (anexos.length === 0) {
      resultado.semAnexo += 1;
      continue;
    }

    // Dois itens com o mesmo nome (mesmo imóvel, mesmo dano) não se misturam.
    const base = nomePacoteAnexos(pacote);
    const repeticao = (nomesUsados.get(base) || 0) + 1;
    nomesUsados.set(base, repeticao);
    const pasta = zip.folder(repeticao > 1 ? `${base} (${repeticao})` : base)!;

    const blobs = await emParalelo(anexos, (a) => baixarArquivo(a.file_url), 3);
    for (let i = 0; i < anexos.length; i++) {
      const r = blobs[i];
      if (!r.ok || !r.valor) {
        resultado.falhas += 1;
        continue;
      }
      const a = anexos[i];
      pasta.file(await buildZipEntryNameFromBlob(i, r.valor, a.file_name, a.file_type, a.file_url), r.valor);
      resultado.baixados += 1;
    }
  }

  if (resultado.baixados === 0) return resultado;

  // Foto e vídeo já são comprimidos: guardar sem recomprimir é bem mais rápido.
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
  const nomeZip =
    pacotes.length === 1
      ? `${nomePacoteAnexos(pacotes[0])}.zip`
      : `Anexos de manutenções - ${new Date().toLocaleDateString("sv-SE")}.zip`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeZip;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  // Revoga depois: no celular o download demora a começar.
  setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 3000);

  return resultado;
}

/** Texto do aviso depois do download, igual na lista e no painel. */
export function resumoDownloadAnexos(r: ResultadoDownloadAnexos): string {
  const partes = [`${r.baixados} ${r.baixados === 1 ? "arquivo" : "arquivos"}`];
  if (r.falhas > 0) partes.push(`${r.falhas} não ${r.falhas === 1 ? "pôde ser baixado" : "puderam ser baixados"}`);
  if (r.semAnexo > 0) partes.push(`${r.semAnexo} sem anexo`);
  return partes.join(" · ");
}
