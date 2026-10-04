import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AbaPilula, BarraFiltros } from "@/components/painel/PaginaInterna";
import { Etiqueta } from "@/components/painel/Etiqueta";
import { cn } from "@/lib/utils";
import { DetalheReserva } from "./blocos";
import { formatarDia, infoCanal, reais, situacaoDaReserva, type ReservaCalculada } from "@/lib/resultadosImovel";

interface Props {
  reservas: ReservaCalculada[];
  hoje: number;
  comissaoPct: number | null;
  visaoEquipe: boolean;
}

type Filtro = "proximas" | "agora" | "concluidas";
const PAGINA = 15;

/** Todas as reservas do imóvel, em três grupos. Cada linha abre a divisão do valor. */
export function ListaReservas({ reservas, hoje, comissaoPct, visaoEquipe }: Props) {
  const grupos = useMemo(() => {
    const proximas = reservas.filter((r) => r.ci > hoje).sort((a, b) => a.ci - b.ci);
    const agora = reservas.filter((r) => r.ci <= hoje && hoje < r.co);
    const concluidas = reservas.filter((r) => r.co <= hoje).sort((a, b) => b.ci - a.ci);
    return { proximas, agora, concluidas };
  }, [reservas, hoje]);

  const [filtro, setFiltro] = useState<Filtro>(() => (grupos.agora.length > 0 ? "agora" : grupos.proximas.length > 0 ? "proximas" : "concluidas"));
  const [aberta, setAberta] = useState<string | null>(null);
  const [limite, setLimite] = useState(PAGINA);

  const lista = grupos[filtro];
  const trocar = (f: Filtro) => {
    setFiltro(f);
    setAberta(null);
    setLimite(PAGINA);
  };

  return (
    <div className="space-y-3">
      <BarraFiltros role="tablist" aria-label="Situação das reservas">
        <AbaPilula ativa={filtro === "agora"} quantidade={grupos.agora.length} tom="success" onClick={() => trocar("agora")}>
          Hospedados agora
        </AbaPilula>
        <AbaPilula ativa={filtro === "proximas"} quantidade={grupos.proximas.length} tom="info" onClick={() => trocar("proximas")}>
          Próximas
        </AbaPilula>
        <AbaPilula ativa={filtro === "concluidas"} quantidade={grupos.concluidas.length} onClick={() => trocar("concluidas")}>
          Concluídas
        </AbaPilula>
      </BarraFiltros>

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
        {lista.length === 0 ? (
          <EmptyState
            ilustracao="busca"
            title={filtro === "agora" ? "Ninguém hospedado agora" : filtro === "proximas" ? "Nenhuma reserva futura" : "Nenhuma reserva concluída"}
            description={filtro === "proximas" ? "Assim que entrar uma reserva nova, ela aparece aqui." : undefined}
          />
        ) : (
          <ul className="divide-y divide-border/60">
            {lista.slice(0, limite).map((r) => {
              const canal = infoCanal(r.canal);
              const situacao = situacaoDaReserva(r, hoje);
              const expandida = aberta === r.id;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    aria-expanded={expandida}
                    onClick={() => setAberta(expandida ? null : r.id)}
                    className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:px-4"
                  >
                    <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: canal.cor }} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-sm font-medium tabular-nums">
                          {formatarDia(r.ci, true)} → {formatarDia(r.co, true)}
                        </span>
                        <Etiqueta tom={situacao.tom} className="hidden sm:inline-flex">
                          {situacao.rotulo}
                        </Etiqueta>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {canal.rotulo} · {r.noites} {r.noites === 1 ? "noite" : "noites"}
                        {r.hospedes ? ` · ${r.hospedes} ${r.hospedes === 1 ? "hóspede" : "hóspedes"}` : ""}
                        {visaoEquipe && r.hospede ? ` · ${r.hospede}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums">{reais(r.diarias)}</span>
                      <span className="block text-[11px] tabular-nums text-muted-foreground">{reais(r.diariaMedia)}/noite</span>
                    </span>
                    <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", expandida && "rotate-180")} aria-hidden="true" />
                  </button>
                  {expandida && (
                    <div className="border-t border-border/60 bg-muted/30 px-4 py-4 md:px-8">
                      <DetalheReserva reserva={r} hoje={hoje} comissaoPct={comissaoPct} visaoEquipe={visaoEquipe} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {lista.length > limite && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setLimite((l) => l + PAGINA)}>
            Mostrar mais {Math.min(PAGINA, lista.length - limite)} de {lista.length - limite}
          </Button>
        </div>
      )}
    </div>
  );
}
