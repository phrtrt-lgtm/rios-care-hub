import { cn } from "@/lib/utils";

/**
 * Classes do painel do assistente: folha de baixo quase de tela cheia no
 * celular; no desktop, cartão de 420 px ancorado no canto do balão, com
 * sombra na cor da marca. Fica fora do componente para a galeria de
 * verificação visual usar a mesma string.
 */
export const CLASSES_PAINEL = cn(
  "fixed z-50 flex flex-col overflow-hidden bg-background text-foreground outline-none",
  "inset-x-0 bottom-0 h-[calc(100dvh-2.5rem)] rounded-t-3xl border-t border-border/70 shadow-2xl",
  "md:inset-auto md:bottom-6 md:right-6 md:h-[min(680px,calc(100dvh-3rem))] md:w-[420px] md:rounded-3xl md:border",
  "md:shadow-[0_30px_80px_-24px_hsl(var(--secondary)/0.55)]",
  "duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
  "data-[state=open]:slide-in-from-bottom-8 data-[state=closed]:slide-out-to-bottom-8",
  "md:data-[state=open]:zoom-in-95 md:data-[state=closed]:zoom-out-95 md:data-[state=open]:slide-in-from-bottom-4 md:data-[state=closed]:slide-out-to-bottom-4",
  "motion-reduce:animate-none",
);

/** Botões redondos do cabeçalho (histórico, nova conversa, fechar) sobre o gradiente. */
export const CLASSE_BOTAO_CABECALHO =
  "flex h-9 w-9 items-center justify-center rounded-full text-secondary-foreground/80 transition-colors hover:bg-secondary-foreground/15 hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-foreground/60 disabled:pointer-events-none disabled:opacity-50";
