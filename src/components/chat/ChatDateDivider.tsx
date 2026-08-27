import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";

export function ChatDateDivider({ date }: { date: string }) {
  const d = new Date(date);
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
