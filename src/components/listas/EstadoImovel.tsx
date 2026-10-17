import { format, isToday, isTomorrow } from "date-fns";
import { Etiqueta } from "@/components/painel/Etiqueta";
import { cn } from "@/lib/utils";
import { ESTADO_HOJE, type JanelaImovel } from "@/hooks/useJanelaImoveis";

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "hoje", "amanhã" ou "sáb 18/10" (o ptBR do date-fns escreve "segunda" por extenso). */
function dia(d: Date): string {
  if (isToday(d)) return "hoje";
  if (isTomorrow(d)) return "amanhã";
  return `${SEMANA[d.getDay()]} ${format(d, "dd/MM")}`;
}

/** Frase completa para o title (passar o mouse) e para leitor de tela. */
function frase(j: JanelaImovel): string {
  const co = j.proximoCheckout ? `check-out ${dia(j.proximoCheckout)}` : "sem check-out à frente";
  const entra = j.proximaEntrada ? `próxima entrada ${dia(j.proximaEntrada)}` : "sem próxima reserva";
  if (j.estado === "ocupado") return `Ocupado: ${co}; ${entra}.`;
  if (j.estado === "sai_hoje") return `Hóspede sai hoje; ${entra}; próximo ${co}.`;
  return j.proximaEntrada ? `Livre até ${dia(j.proximaEntrada)}; próximo ${co}.` : "Livre, sem reserva à frente.";
}

/** Só o estado de hoje (coluna "Hoje" da lista de manutenções). */
export function CelulaEstadoHoje({ janela }: { janela?: JanelaImovel }) {
  if (!janela) return <span className="text-xs text-muted-foreground">—</span>;
  const meta = ESTADO_HOJE[janela.estado];
  const complemento =
    janela.estado === "livre"
      ? janela.proximaEntrada
        ? `até ${dia(janela.proximaEntrada)}`
        : "sem reserva"
      : janela.estado === "sai_hoje"
        ? janela.proximaEntrada
          ? `entra ${dia(janela.proximaEntrada)}`
          : "livre depois"
        : null;
  return (
    <div className="flex min-w-0 flex-col items-start gap-0.5" title={frase(janela)}>
      <Etiqueta tom={meta.tom} ponto>
        {meta.rotulo}
      </Etiqueta>
      {complemento && <span className="truncate text-[11px] text-muted-foreground">{complemento}</span>}
    </div>
  );
}

/** Só o próximo check-out (coluna "Próx. check-out"). */
export function CelulaCheckout({ janela }: { janela?: JanelaImovel }) {
  return (
    <span
      className="text-xs tabular-nums text-foreground/80"
      title={janela ? frase(janela) : undefined}
    >
      {janela?.proximoCheckout ? dia(janela.proximoCheckout) : <span className="text-muted-foreground">—</span>}
    </span>
  );
}

interface Props {
  janela?: JanelaImovel;
  /** "celula" = duas linhas compactas (tabela); "linha" = uma linha (cabeçalho de grupo, cartão). */
  variante?: "celula" | "linha";
  className?: string;
}

/**
 * Estado do imóvel hoje (ocupado, sai hoje, livre) e o próximo check-out,
 * para quem vai resolver algo lá saber quando dá para ir.
 */
export function EstadoImovel({ janela, variante = "celula", className }: Props) {
  if (!janela) {
    return <span className={cn("text-xs text-muted-foreground", className)}>—</span>;
  }
  const meta = ESTADO_HOJE[janela.estado];
  const complemento =
    janela.estado === "livre"
      ? janela.proximaEntrada
        ? `até ${dia(janela.proximaEntrada)}`
        : "sem reserva"
      : janela.estado === "sai_hoje"
        ? janela.proximaEntrada
          ? `entra ${dia(janela.proximaEntrada)}`
          : "livre depois"
        : null;
  const checkout = janela.proximoCheckout ? `Check-out ${dia(janela.proximoCheckout)}` : null;
  const texto = frase(janela);

  if (variante === "linha") {
    return (
      <span className={cn("inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs", className)} title={texto}>
        <Etiqueta tom={meta.tom} ponto>
          {meta.rotulo}
        </Etiqueta>
        {complemento && <span className="text-muted-foreground">{complemento}</span>}
        {checkout && <span className="text-muted-foreground">· {checkout}</span>}
        <span className="sr-only">{texto}</span>
      </span>
    );
  }

  return (
    <div className={cn("flex min-w-0 flex-col items-start gap-0.5", className)} title={texto}>
      <span className="flex min-w-0 items-center gap-1">
        <Etiqueta tom={meta.tom} ponto>
          {meta.rotulo}
        </Etiqueta>
        {complemento && <span className="truncate text-[11px] text-muted-foreground">{complemento}</span>}
      </span>
      <span className="truncate text-[11px] tabular-nums text-muted-foreground">{checkout ?? "Sem check-out à frente"}</span>
      <span className="sr-only">{texto}</span>
    </div>
  );
}
