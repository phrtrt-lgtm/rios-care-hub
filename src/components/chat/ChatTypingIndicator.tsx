interface ChatTypingIndicatorProps {
  names: string[];
}

export function ChatTypingIndicator({ names }: ChatTypingIndicatorProps) {
  if (names.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-1 py-2 animate-in fade-in slide-in-from-bottom-1">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-border/60 bg-muted px-3 py-2">
        <span
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary"
          style={{ animationDelay: "300ms" }}
        />
      </div>
      <span className="text-[11px] text-muted-foreground">
        {names.join(", ")} {names.length > 1 ? "estão digitando" : "está digitando"}…
      </span>
    </div>
  );
}
