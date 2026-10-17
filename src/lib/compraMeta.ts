import type { Tom } from "@/components/painel/tons";

/**
 * Vocabulário da lista de compras (tabela `compras`, página /compras).
 * Os valores espelham os `check` da migration `20261017120000_compras.sql`.
 */

export type StatusCompra = "pendente" | "comprado" | "descartado";

/** Onde se compra: muda quem recebe o WhatsApp (system_config 'listas_whatsapp'). */
export type CanalCompra = "rua" | "online";

export const CANAL_COMPRA: Record<CanalCompra, { rotulo: string; dica: string }> = {
  rua: { rotulo: "Na rua", dica: "Comprado em loja física pela equipe de rua" },
  online: { rotulo: "Online", dica: "Comprado pela internet pela gestão" },
};

export const STATUS_COMPRA: Record<StatusCompra, { rotulo: string; tom: Tom }> = {
  pendente: { rotulo: "A comprar", tom: "warning" },
  comprado: { rotulo: "Comprado", tom: "success" },
  descartado: { rotulo: "Não vai comprar", tom: "neutral" },
};

export const ITEM_MIN = 2;
export const ITEM_MAX = 200;
export const QUANTIDADE_MAX = 999;

/**
 * Link do produto a partir do que foi colado. O "compartilhar" das lojas cola
 * texto junto ("Olha isso! https://..."), então vale a primeira URL do texto.
 * Devolve null para campo vazio e undefined quando não há link válido.
 */
export function normalizarLink(texto: string): string | null | undefined {
  const limpo = texto.trim();
  if (!limpo) return null;
  const achado = limpo.match(/https?:\/\/\S+/i)?.[0] ?? (/^www\./i.test(limpo) ? `https://${limpo.split(/\s/)[0]}` : null);
  if (!achado) return undefined;
  try {
    const url = new URL(achado.replace(/[),.;]+$/, ""));
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString().slice(0, 2000);
  } catch {
    return undefined;
  }
}

/** "https://www.amazon.com.br/dp/X" → "amazon.com.br"; "produto.mercadolivre.com.br" → "mercadolivre.com.br". */
export function lojaDoLink(link: string): string {
  try {
    return new URL(link).hostname.replace(/^(www|m|produto|loja|shop)\./, "");
  } catch {
    return "link";
  }
}
