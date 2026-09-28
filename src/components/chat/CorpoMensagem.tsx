import type { ReactNode } from "react";
import { MentionText } from "@/components/comments/MentionText";
import { cn } from "@/lib/utils";

// Emoji no começo de uma linha ("📅 **Manutenção agendada**", "📎 Anexo"):
// mensagens antigas do sistema começavam assim, e a interface não usa emoji.
const EMOJI_INICIO_RE =
  /^(?:(?:[\u{1F000}-\u{1FAFF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]|\u{FE0F}|\u{200D})+[ \t]?)+/gmu;
const NEGRITO_RE = /\*\*([^*\n]+?)\*\*/g;

/**
 * Corpo de mensagem igual em todas as conversas (chamado, cobrança, equipe):
 * menções `@[Nome](uuid)` viram nome clicável (MentionText), `**texto**` vira
 * negrito de verdade e o emoji de abertura some.
 */
export function renderizarCorpo(body: string, className?: string): ReactNode {
  const texto = body.replace(EMOJI_INICIO_RE, "");
  const classes = cn("inline text-[13px]", className);
  const partes: ReactNode[] = [];
  const re = new RegExp(NEGRITO_RE.source, "g");
  let ultimo = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) {
      partes.push(<MentionText key={`t${i}`} body={texto.slice(ultimo, m.index)} className={classes} />);
    }
    partes.push(
      <strong key={`n${i}`} className="font-semibold">
        <MentionText body={m[1]} className={classes} />
      </strong>,
    );
    ultimo = m.index + m[0].length;
    i += 1;
  }
  if (ultimo < texto.length) {
    partes.push(<MentionText key="fim" body={texto.slice(ultimo)} className={classes} />);
  }
  return <>{partes}</>;
}

/** Versão em componente, para usar direto no JSX. */
export function CorpoMensagem({ body, className }: { body: string; className?: string }) {
  return <>{renderizarCorpo(body, className)}</>;
}
