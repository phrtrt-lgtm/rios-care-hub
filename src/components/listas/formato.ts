import { format, formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";

/** "Paulo Henrique Ribeiro Toledo Rios" → "Paulo Henrique"; "Maria" e "Maria Cristina" continuam distintas. */
export function nomeCurto(nome?: string | null): string {
  return (nome ?? "").trim().split(/\s+/).slice(0, 2).join(" ");
}

/** "há 3 horas" (sem o "cerca de" que cortava a linha no celular) e a data completa para o title. */
export function quando(data: string) {
  const d = new Date(data);
  const recente = Date.now() - d.getTime() < 60_000;
  return {
    relativo: recente ? "agora" : formatDistanceToNowStrict(d, { addSuffix: true, locale: ptBR }),
    completo: format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }),
  };
}
