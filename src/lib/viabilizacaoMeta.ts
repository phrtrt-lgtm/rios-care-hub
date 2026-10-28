import type { Tom } from "@/components/painel/tons";

/**
 * Vocabulário da viabilização de imóveis novos (tabela `viabilizacoes`,
 * página /novos-imoveis, §3.19 do CLAUDE.md). Os valores espelham o `check`
 * da migration `20261027120000_viabilizacoes.sql`.
 */

export type EtapaViabilizacao = "captado" | "visita" | "preparacao" | "pronto" | "no_ar" | "desistiu";

export interface MetaEtapa {
  rotulo: string;
  /** Uma linha explicando quando o imóvel está nessa etapa. */
  descricao: string;
  tom: Tom;
  /** Etapa final: a viabilização sai de "Em andamento". */
  final: boolean;
}

/** Na ordem do funil. */
export const ETAPAS: Record<EtapaViabilizacao, MetaEtapa> = {
  captado: { rotulo: "Captado", descricao: "Fechou com a RIOS; ainda não foi visitado", tom: "neutral", final: false },
  visita: { rotulo: "Visita marcada", descricao: "Visita agendada para levantar o que fazer", tom: "info", final: false },
  preparacao: { rotulo: "Em preparação", descricao: "Consertos, compras e montagem em andamento", tom: "warning", final: false },
  pronto: { rotulo: "Pronto para anunciar", descricao: "Tudo feito; falta fotografar e publicar", tom: "success", final: false },
  no_ar: { rotulo: "No ar", descricao: "Anunciado e recebendo reservas", tom: "primary", final: true },
  desistiu: { rotulo: "Desistência", descricao: "O proprietário não seguiu com a RIOS", tom: "destructive", final: true },
};

export const ORDEM_ETAPAS = Object.keys(ETAPAS) as EtapaViabilizacao[];
export const ETAPAS_ABERTAS = ORDEM_ETAPAS.filter((e) => !ETAPAS[e].final);
export const ETAPAS_FINAIS = ORDEM_ETAPAS.filter((e) => ETAPAS[e].final);

export const ehEtapaFinal = (etapa: string | null | undefined): boolean =>
  !!etapa && (ETAPAS[etapa as EtapaViabilizacao]?.final ?? false);

export const metaEtapa = (etapa: string | null | undefined): MetaEtapa =>
  ETAPAS[etapa as EtapaViabilizacao] ?? ETAPAS.captado;

export const NOME_MIN = 2;
export const NOME_MAX = 80;
export const OBSERVACOES_MAX = 4000;

/** Etapa que faz sentido ao criar: com visita marcada começa em "Visita marcada". */
export function etapaInicial(visitaEm: string | null, temItens = false): EtapaViabilizacao {
  if (temItens) return "preparacao";
  return visitaEm ? "visita" : "captado";
}

/** Link do WhatsApp para um telefone brasileiro escrito de qualquer jeito. */
export function linkWhatsapp(telefone: string | null | undefined): string | null {
  const digitos = (telefone ?? "").replace(/\D/g, "");
  if (digitos.length < 10) return null;
  const completo = digitos.length <= 11 ? `55${digitos}` : digitos;
  return `https://wa.me/${completo}`;
}

/** Link do mapa para um endereço escrito à mão. */
export function linkMapa(endereco: string | null | undefined): string | null {
  const texto = (endereco ?? "").trim();
  if (!texto) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(texto)}`;
}

/** "aaaa-mm-dd" como dia local (new Date("aaaa-mm-dd") seria meia-noite UTC). */
export function diaLocal(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const [a, m, d] = valor.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return null;
  return new Date(a, m - 1, d);
}

/* ------------------------------------------------------------------------ */
/* E-mail de conclusão ao proprietário (tabela viabilizacao_avisos)          */
/* ------------------------------------------------------------------------ */

/** Só a conclusão de item avisa; o gestor não quer aviso de movimentação (2026-10-28). */
export type TipoAviso = "item_feito";
/** `cobrado` = não foi enviado porque a cobrança do item já avisou. */
export type StatusAviso = "pendente" | "disparado" | "enviado" | "falhou" | "sem_destino" | "desligado" | "cobrado";

export interface AvisoProprietario {
  id: string;
  tipo: TipoAviso;
  status: StatusAviso;
  created_at: string;
  enviado_em: string | null;
  erro: string | null;
}

export interface SituacaoAvisos {
  rotulo: string;
  tom: Tom;
  /** Complemento para o tooltip. */
  detalhe: string | null;
  /** Instante do último envio ou falha, quando é o caso. */
  em: string | null;
}

/**
 * Resume os últimos avisos para a linha do cartão: o que está na fila manda,
 * depois o resultado mais recente. `avisos` vem do mais novo para o mais velho.
 */
export function situacaoAvisos(avisos: AvisoProprietario[], ligado: boolean, temEmail: boolean): SituacaoAvisos {
  if (!ligado) {
    return { rotulo: "E-mail de conclusão desligado", tom: "neutral", detalhe: "Ligue no menu do imóvel para o proprietário receber e-mail quando um item for concluído", em: null };
  }
  const naFila = avisos.filter((a) => a.status === "pendente" || a.status === "disparado").length;
  if (!temEmail) {
    return {
      rotulo: naFila > 0 ? `${naFila} ${naFila === 1 ? "conclusão espera" : "conclusões esperam"} um e-mail` : "Sem e-mail do proprietário",
      tom: "warning",
      detalhe: "Informe o e-mail em Editar dados para o aviso de conclusão sair",
      em: null,
    };
  }
  if (naFila > 0) {
    return {
      rotulo: `${naFila} ${naFila === 1 ? "conclusão a enviar" : "conclusões a enviar"} por e-mail`,
      tom: "info",
      detalhe: "Itens concluídos juntam por 10 minutos e saem num e-mail só; item já cobrado não entra",
      em: null,
    };
  }
  const ultimo = avisos.find((a) => a.status === "enviado" || a.status === "falhou" || a.status === "sem_destino");
  if (ultimo?.status === "enviado") return { rotulo: "Proprietário avisado por e-mail", tom: "success", detalhe: null, em: ultimo.enviado_em ?? ultimo.created_at };
  if (ultimo?.status === "falhou") return { rotulo: "E-mail de conclusão falhou", tom: "destructive", detalhe: ultimo.erro, em: ultimo.created_at };
  if (ultimo?.status === "sem_destino") return { rotulo: "E-mail não saiu: sem endereço", tom: "warning", detalhe: ultimo.erro, em: ultimo.created_at };
  return { rotulo: "E-mail de conclusão ligado", tom: "neutral", detalhe: "O proprietário recebe um e-mail quando itens são concluídos; a cobrança avisa pelo caminho de sempre", em: null };
}
