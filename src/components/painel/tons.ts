/**
 * Tons semânticos usados pelos blocos do painel (equipe e proprietário).
 *
 * Cada tom vira classes prontas para o ícone em caixa tingida, o ponto de
 * rótulo de grupo, o texto colorido e a borda. As classes ficam escritas por
 * extenso para o Tailwind conseguir gerá-las.
 */
export type Tom = "primary" | "secondary" | "success" | "warning" | "info" | "destructive" | "neutral";

export const TOM: Record<
  Tom,
  { caixa: string; ponto: string; texto: string; borda: string; fundo: string }
> = {
  primary: {
    caixa: "bg-primary/10 text-primary",
    ponto: "bg-primary",
    texto: "text-primary",
    borda: "border-primary/30",
    fundo: "bg-primary/5",
  },
  secondary: {
    caixa: "bg-secondary/10 text-secondary",
    ponto: "bg-secondary",
    texto: "text-secondary",
    borda: "border-secondary/30",
    fundo: "bg-secondary/5",
  },
  success: {
    caixa: "bg-success/10 text-success",
    ponto: "bg-success",
    texto: "text-success",
    borda: "border-success/30",
    fundo: "bg-success/5",
  },
  warning: {
    caixa: "bg-warning/10 text-warning",
    ponto: "bg-warning",
    texto: "text-warning",
    borda: "border-warning/30",
    fundo: "bg-warning/5",
  },
  info: {
    caixa: "bg-info/10 text-info",
    ponto: "bg-info",
    texto: "text-info",
    borda: "border-info/30",
    fundo: "bg-info/5",
  },
  destructive: {
    caixa: "bg-destructive/10 text-destructive",
    ponto: "bg-destructive",
    texto: "text-destructive",
    borda: "border-destructive/30",
    fundo: "bg-destructive/5",
  },
  neutral: {
    caixa: "bg-muted text-muted-foreground",
    ponto: "bg-muted-foreground/60",
    texto: "text-muted-foreground",
    borda: "border-border",
    fundo: "bg-muted/40",
  },
};

/** Saudação pela hora local: bom dia, boa tarde, boa noite. */
export function saudacao(data = new Date()): string {
  const h = data.getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/** Primeiro nome, para a saudação não ficar com o nome completo. */
export function primeiroNome(nome?: string | null): string {
  return (nome ?? "").trim().split(/\s+/)[0] || "";
}
