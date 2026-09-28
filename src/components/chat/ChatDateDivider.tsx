import { format, isToday, isYesterday, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Divisor "Hoje / Ontem / 12 de maio" entre grupos de mensagens.
 *
 * A chave do grupo é um dia ("2026-09-28"). `new Date("2026-09-28")` lê como
 * meia-noite UTC — 21h da véspera no Brasil — e as mensagens de hoje
 * apareciam como "Ontem". `parseISO` lê como dia local.
 */
export function ChatDateDivider({ date }: { date: string }) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? parseISO(date) : new Date(date);
  const label = isToday(d)
    ? "Hoje"
    : isYesterday(d)
      ? "Ontem"
      : format(d, "dd 'de' MMMM", { locale: ptBR });

  return (
    <div className="sticky top-0 z-10 flex justify-center py-2">
      <span className="rounded-full border border-border/60 bg-background/80 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-md">
        {label}
      </span>
    </div>
  );
}
