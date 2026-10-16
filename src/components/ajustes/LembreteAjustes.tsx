import { useNavigate } from "react-router-dom";
import { ChevronRight, Plus, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SeloContagem } from "@/components/painel/CaixaOperacao";
import { TOM, type Tom } from "@/components/painel/tons";
import { cn } from "@/lib/utils";
import { useContagemAjustes } from "@/hooks/useAjustes";

/**
 * Linha do topo do painel: quantos ajustes a equipe avisou e ainda estão por
 * fazer. É o lembrete que substitui o WhatsApp. Clique abre /ajustes;
 * "Avisar" abre o formulário.
 */
export function LembreteAjustes() {
  const navigate = useNavigate();
  const { data, isError } = useContagemAjustes();

  // Sem a contagem, a linha some: o painel não depende dela.
  if (isError) return null;

  const abertos = data?.abertos ?? 0;
  const urgentes = data?.urgentes ?? 0;
  const tom: Tom = urgentes > 0 ? "destructive" : abertos > 0 ? "warning" : "neutral";

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border bg-card pr-2 shadow-sm",
        urgentes > 0 ? "border-destructive/40" : "border-border/70",
      )}
    >
      <button
        type="button"
        onClick={() => navigate("/ajustes")}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", TOM[tom].caixa)} aria-hidden="true">
          <SlidersHorizontal className="h-4 w-4" />
        </span>
        {/* No celular os selos descem para a linha de baixo; a seta fica no meio, à direita. */}
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="truncate text-sm font-semibold tracking-tight">Ajustes</span>
          {data === undefined ? null : abertos === 0 ? (
            <span className="text-sm text-muted-foreground">Nada para ajustar</span>
          ) : (
            <span className="flex flex-wrap items-center gap-1.5 [&>span]:whitespace-nowrap">
              <SeloContagem tom="warning">{abertos} a fazer</SeloContagem>
              {urgentes > 0 && (
                <SeloContagem tom="destructive">
                  {urgentes} {urgentes === 1 ? "urgente" : "urgentes"}
                </SeloContagem>
              )}
            </span>
          )}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => navigate("/ajustes?novo=1")}
        className="h-8 shrink-0 gap-1 px-2 text-xs text-muted-foreground"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        Avisar
      </Button>
    </div>
  );
}
