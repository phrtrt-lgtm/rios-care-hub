import type { PerfilDosHospedes } from "@/lib/perfilDosHospedes";
import type { NoitesAVenda, RitmoMes } from "@/lib/resultadosAFrente";
import { formatarDiaExtenso, nomeDoMes, pct, reais, type Adiante, type MesSerie } from "@/lib/resultadosImovel";

/**
 * O que o Mini Paulo diz no topo da página de resultados. São frases
 * calculadas dos mesmos números da página, sem IA: cada uma aponta para o
 * cartão de onde saiu.
 */

/** Gestos que uma fala pode pedir; cada um toca um clipe do Paulo (ver PauloDeFilme.tsx). */
export type GestoPaulo = "greet" | "point" | "cheer" | "look" | "dance";

export interface FalaDoPaulo {
  id: string;
  texto: string;
  /** Gesto que acompanha a fala ("point" apresenta com a mão, "cheer" é o joinha); sem ele, o Paulo só conversa. */
  gesto?: GestoPaulo;
  /** Botão do balão: leva a um cartão da página (id do elemento) ou faz algo. */
  acao?: { rotulo: string; alvo?: string; aoClicar?: () => void };
}

/** Ids dos cartões para onde as falas apontam. */
export const ALVO = {
  adiante: "titulo-adiante",
  noites: "cartao-noites-a-venda",
  ritmo: "cartao-ritmo-de-venda",
  hospedes: "cartao-quem-se-hospedou",
} as const;

function primeiroNome(nome: string | null | undefined): string | null {
  const limpo = (nome ?? "").trim().split(/\s+/)[0];
  if (!limpo) return null;
  return limpo.charAt(0).toUpperCase() + limpo.slice(1).toLowerCase();
}

const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function falasDoPaulo(a: {
  /** Nome de quem está vendo (o proprietário) */
  nomePessoa: string | null | undefined;
  /** A equipe abrindo o imóvel de alguém: a saudação muda e leva o nome do imóvel */
  equipe: boolean;
  imovel: string;
  hoje: number;
  adiante: Adiante;
  serie: MesSerie[];
  ritmo: RitmoMes[];
  venda: NoitesAVenda | null;
  /** Hóspedes do ano em curso */
  perfilDoAno: PerfilDosHospedes | null;
  /** Abre a história do último mês fechado */
  resumo?: { rotulo: string; onAbrir: () => void };
  /** Abre a aba do plano de melhorias */
  melhorias?: { onAbrir: () => void };
}): FalaDoPaulo[] {
  const falas: FalaDoPaulo[] = [];
  const nome = primeiroNome(a.nomePessoa);

  // Para o proprietário não se cita o nome do imóvel: quase todos levam o nome do próprio dono.
  falas.push({
    id: "oi",
    texto: a.equipe
      ? `Oi! Estes são os resultados do imóvel ${a.imovel}.`
      : `Oi${nome ? `, ${nome}` : ""}! Vem ver como vai o seu imóvel.`,
  });

  // ---- agora ----
  const { emCasa, proxima } = a.adiante;
  if (emCasa) {
    falas.push({
      id: "agora",
      texto: `Tem hóspede no imóvel agora. O check-out é dia ${formatarDiaExtenso(emCasa.co)}.`,
      gesto: "point",
      acao: { rotulo: "Ver as próximas", alvo: ALVO.adiante },
    });
  } else if (proxima) {
    const dias = proxima.ci - a.hoje;
    const quando = dias <= 0 ? "é hoje" : dias === 1 ? "é amanhã" : `é em ${dias} dias, dia ${formatarDiaExtenso(proxima.ci)}`;
    falas.push({
      id: "agora",
      texto: `O imóvel está livre hoje. O próximo check-in ${quando}.`,
      gesto: "point",
      acao: { rotulo: "Ver as próximas", alvo: ALVO.adiante },
    });
  } else {
    falas.push({ id: "agora", texto: "Ainda não há reserva daqui para frente. As noites à venda estão logo abaixo.", acao: { rotulo: "Ver as noites", alvo: ALVO.noites } });
  }

  // ---- último mês fechado ----
  const fechado = [...a.serie].reverse().find((m) => !m.futuro && !m.atual && m.ocupacao != null && m.noites > 0);
  if (fechado && fechado.ocupacao != null) {
    const bom = fechado.ocupacao >= Math.max(0.5, fechado.ocupacaoRios ?? 0);
    falas.push({
      id: "mes",
      texto: `${maiuscula(nomeDoMes(fechado.ano, fechado.mes0, false))} fechou com ${pct(fechado.ocupacao)} de ocupação e ${reais(fechado.realizado)} em diárias.`,
      gesto: bom ? "cheer" : undefined,
      acao: a.resumo ? { rotulo: "Ver o resumo", aoClicar: a.resumo.onAbrir } : undefined,
    });
  }

  // ---- ritmo do mês que vem ----
  const mes = a.ritmo[0];
  if (mes && (mes.noites > 0 || mes.mercado != null)) {
    const nomeMes = maiuscula(nomeDoMes(mes.ano, mes.mes0, false));
    const frente = mes.mercado != null && mes.imovel >= mes.mercado + 0.05 && mes.imovel >= 0.3;
    falas.push({
      id: "ritmo",
      texto:
        `${nomeMes} já tem ${pct(mes.imovel)} das noites reservadas.` +
        (mes.mercado != null ? ` Os imóveis em volta estão em ${pct(mes.mercado)}.` : ""),
      gesto: frente ? "cheer" : undefined,
      acao: { rotulo: "Ver o ritmo", alvo: ALVO.ritmo },
    });
  }

  // ---- noites à venda ----
  if (a.venda) {
    const { aVenda, precoMinCents } = a.venda;
    falas.push({
      id: "venda",
      texto:
        aVenda === 0
          ? "Os próximos 30 dias estão todos tomados: não sobrou noite à venda."
          : `Nos próximos 30 dias, ${aVenda} ${aVenda === 1 ? "noite está" : "noites estão"} à venda` +
            (precoMinCents != null ? `, a partir de ${reais(precoMinCents)}.` : "."),
      gesto: aVenda === 0 ? "cheer" : undefined,
      acao: { rotulo: "Ver as noites", alvo: ALVO.noites },
    });
  }

  // ---- quem veio ----
  const p = a.perfilDoAno;
  if (p && p.pessoas >= 4) {
    const pequenos = p.criancas + p.bebes;
    falas.push({
      id: "hospedes",
      texto:
        `Neste ano, ${p.pessoas.toLocaleString("pt-BR")} pessoas se hospedaram aqui` +
        (pequenos > 0 ? `, ${pequenos.toLocaleString("pt-BR")} delas ${pequenos === 1 ? "criança" : "crianças"}.` : "."),
      gesto: "point",
      acao: { rotulo: "Ver quem veio", alvo: ALVO.hospedes },
    });
  }

  // ---- plano de melhorias ----
  if (a.melhorias) {
    falas.push({
      id: "melhorias",
      texto: a.equipe
        ? "Tem também o plano de melhorias deste imóvel: a maquete e a conta de cada item."
        : "Montei um plano de melhorias para o seu imóvel, com maquete e a conta de cada item. Quer ver?",
      gesto: "point",
      acao: { rotulo: "Ver o plano", aoClicar: a.melhorias.onAbrir },
    });
  }

  return falas;
}

const CLASSES_DO_REALCE = ["ring-2", "ring-primary/70", "ring-offset-2", "ring-offset-background"];

/** Rola até o cartão e o contorna por um instante, para a pessoa achar de onde saiu a frase. */
export function irAteOAlvo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const semMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: semMovimento ? "auto" : "smooth", block: "center" });
  // o título de seção não tem moldura: o realce vai no cartão (ou seção) em volta dele
  const moldura = el.tagName === "SECTION" ? el : (el.closest("section") ?? el);
  moldura.classList.add("rounded-xl", "transition-shadow", "duration-500", ...CLASSES_DO_REALCE);
  window.setTimeout(() => moldura.classList.remove(...CLASSES_DO_REALCE), 1800);
}
