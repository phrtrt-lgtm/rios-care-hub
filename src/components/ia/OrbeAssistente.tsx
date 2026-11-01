import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  iconeClassName?: string;
  /** Anel pulsando em volta (só no balão fechado; respeita "reduzir movimento"). */
  pulsar?: boolean;
}

/**
 * A "orbe" do assistente: gradiente terracota → azul da marca com uma faísca.
 * É a assinatura visual da IA no portal — balão, cabeçalho do painel, avatar
 * das respostas e boas-vindas usam a mesma peça, em tamanhos diferentes.
 */
export function OrbeAssistente({ className, iconeClassName, pulsar = false }: Props) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full",
        "bg-gradient-to-br from-primary via-[hsl(var(--rios-terra-light))] to-[hsl(var(--rios-blue-light))] text-primary-foreground",
        "shadow-[0_6px_18px_-6px_hsl(var(--primary)/0.65)]",
        className,
      )}
      aria-hidden="true"
    >
      {pulsar && (
        <span
          className="absolute inset-0 rounded-full bg-primary/40 animate-ping motion-reduce:hidden"
          style={{ animationDuration: "2.8s" }}
        />
      )}
      <Sparkles className={cn("relative", iconeClassName)} />
    </span>
  );
}
