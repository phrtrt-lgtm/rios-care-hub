import { MessagesSquare } from "lucide-react";

export function ChatEmptyState({
  title = "Nenhuma mensagem ainda",
  description = "Escreva a primeira mensagem — a conversa acontece em tempo real.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
        <MessagesSquare className="h-5 w-5 text-primary" />
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-[240px] text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
