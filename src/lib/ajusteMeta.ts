import { BedDouble, FileText, Megaphone, MessageSquareText, Monitor, MoreHorizontal, type LucideIcon } from "lucide-react";
import type { Tom } from "@/components/painel/tons";

/**
 * Vocabulário único dos ajustes (tabela `ajustes`, página /ajustes).
 *
 * As chaves espelham o `check` da tabela (migrations `20261016120000_ajustes.sql`
 * e `20261016130000_ajustes_sistema.sql`):
 * mudou lá, mude aqui.
 */

export type CategoriaAjuste = "anuncio" | "ficha" | "mensagens" | "roupa_de_cama" | "sistema" | "outro";
export type StatusAjuste = "aberto" | "feito" | "descartado";

export interface MetaCategoria {
  rotulo: string;
  icone: LucideIcon;
  /** O que entra nesta categoria, embaixo do botão. */
  dica: string;
  /** Exemplo no campo de descrição. */
  exemplo: string;
}

export const CATEGORIA_AJUSTE: Record<CategoriaAjuste, MetaCategoria> = {
  anuncio: {
    rotulo: "Anúncio",
    icone: Megaphone,
    dica: "Airbnb ou Booking: fotos, comodidades, camas, regras",
    exemplo: "Ex.: o anúncio do Airbnb diz que tem secador de cabelo, mas não tem.",
  },
  ficha: {
    rotulo: "Ficha",
    icone: FileText,
    dica: "Informação errada ou faltando na ficha do imóvel",
    exemplo: "Ex.: a senha do Wi-Fi mudou. A nova é…",
  },
  mensagens: {
    rotulo: "Mensagens",
    icone: MessageSquareText,
    dica: "Mensagens automáticas para o hóspede",
    exemplo: "Ex.: a mensagem de check-in manda pegar a chave na portaria, mas agora é no cofre.",
  },
  roupa_de_cama: {
    rotulo: "Roupa de cama",
    icone: BedDouble,
    dica: "Lençóis, fronhas, toalhas, edredons",
    exemplo: "Ex.: só tem 1 jogo de lençol de casal no quarto 2; precisa de 2.",
  },
  sistema: {
    rotulo: "Sistema",
    icone: Monitor,
    dica: "O próprio portal RIOS: tela com erro, botão que não funciona, algo que falta",
    exemplo: "Ex.: na vistoria, o botão de enviar foto não funciona no celular.",
  },
  outro: {
    rotulo: "Outro",
    icone: MoreHorizontal,
    dica: "Qualquer outra coisa para ajustar",
    exemplo: "Conte o que viu e o que precisa mudar.",
  },
};

/** Ordem dos botões e das pílulas de filtro. */
export const ORDEM_CATEGORIA_AJUSTE: CategoriaAjuste[] = ["anuncio", "ficha", "mensagens", "roupa_de_cama", "sistema", "outro"];

export const STATUS_AJUSTE: Record<StatusAjuste, { rotulo: string; tom: Tom }> = {
  aberto: { rotulo: "A fazer", tom: "warning" },
  feito: { rotulo: "Feito", tom: "success" },
  descartado: { rotulo: "Sem mudança", tom: "neutral" },
};

export function ehCategoriaAjuste(valor: string | null | undefined): valor is CategoriaAjuste {
  return !!valor && valor in CATEGORIA_AJUSTE;
}

/** Limites do banco (`ajustes_descricao_check`, `ajustes_fotos_check`). */
export const DESCRICAO_MIN = 3;
export const DESCRICAO_MAX = 2000;
/** O banco aceita até 6; a tela pede no máximo 4 para o envio não ficar lento. */
export const FOTOS_MAX = 4;
