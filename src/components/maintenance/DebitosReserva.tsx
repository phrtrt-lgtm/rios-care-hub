import { useMemo, useState } from "react";
import { ChevronDown, Landmark } from "lucide-react";
import { CaixaOperacao, SeloContagem } from "@/components/painel/CaixaOperacao";
import { formatarBRL } from "@/lib/cobrancaMeta";
import { cn } from "@/lib/utils";

interface ReservaUsada {
  date?: string;
  coverage_cents?: number;
  owner_value_cents?: number;
  owner_receives_cents?: number;
}

interface CobrancaDebitada {
  id: string;
  title: string;
  status: string;
  amount_cents: number | null;
  management_contribution_cents: number | null;
  reserve_debit_date?: string | null;
  debited_at?: string | null;
  reserve_reservations?: ReservaUsada[] | null;
  property?: { name?: string | null } | null;
}

function dataDoDebito(c: CobrancaDebitada): string | null {
  return c.reserve_debit_date || c.debited_at?.slice(0, 10) || null;
}

function formatarDia(dia: string) {
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
}

function devido(c: CobrancaDebitada) {
  return (c.amount_cents ?? 0) - (c.management_contribution_cents ?? 0);
}

interface Linha {
  c: CobrancaDebitada;
  devido: number;
  coberto: number;
}

/**
 * Débitos em reserva do proprietário, agrupados pela data do débito.
 * Mostra as reservas usadas, quanto foi descontado e quais manutenções
 * ficaram zeradas ou com saldo. Sem registro das reservas (débitos manuais),
 * considera o item inteiro coberto.
 */
export function DebitosReserva({ cobrancas, ano }: { cobrancas: CobrancaDebitada[]; ano?: number }) {
  const [aberto, setAberto] = useState<string | null>(null);

  const grupos = useMemo(() => {
    const mapa = new Map<string, CobrancaDebitada[]>();
    for (const c of cobrancas) {
      if (c.status !== "debited" && !c.reserve_debit_date) continue;
      const dia = dataDoDebito(c);
      if (!dia) continue;
      if (ano && Number(dia.slice(0, 4)) !== ano) continue;
      mapa.set(dia, [...(mapa.get(dia) ?? []), c]);
    }
    return [...mapa.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([dia, itens]) => {
        const ordenados = [...itens].sort((a, b) => devido(a) - devido(b));
        const reservas = (ordenados.find((c) => Array.isArray(c.reserve_reservations) && c.reserve_reservations.length)
          ?.reserve_reservations ?? []) as ReservaUsada[];
        const totalDevido = ordenados.reduce((s, c) => s + devido(c), 0);
        const cobertura = reservas.length
          ? reservas.reduce((s, r) => s + (r.coverage_cents ?? 0), 0)
          : totalDevido;
        let resta = cobertura;
        const linhas: Linha[] = ordenados.map((c) => {
          const d = devido(c);
          const coberto = c.status === "debited" && !reservas.length ? d : Math.max(0, Math.min(d, resta));
          resta -= coberto;
          return { c, devido: d, coberto };
        });
        const descontado = linhas.reduce((s, l) => s + l.coberto, 0);
        return { dia, linhas, reservas, descontado, saldo: totalDevido - descontado };
      });
  }, [cobrancas, ano]);

  if (grupos.length === 0) return null;
  const totalGeral = grupos.reduce((s, g) => s + g.descontado, 0);

  return (
    <CaixaOperacao
      icone={<Landmark />}
      titulo="Débitos em reserva"
      tom="warning"
      selos={<SeloContagem tom="warning">{formatarBRL(totalGeral)}</SeloContagem>}
    >
      <p className="mb-3 text-xs text-muted-foreground">
        Valores descontados do repasse de reservas, já sem o aporte da gestão.
      </p>
      <div className="divide-y rounded-lg border">
        {grupos.map((g) => {
          const estaAberto = aberto === g.dia;
          const zeradas = g.linhas.filter((l) => l.coberto >= l.devido).length;
          return (
            <div key={g.dia}>
              <button
                type="button"
                onClick={() => setAberto(estaAberto ? null : g.dia)}
                className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-muted/50"
                aria-expanded={estaAberto}
              >
                <div>
                  <div className="text-sm font-medium">Débito de {formatarDia(g.dia)}</div>
                  <div className="text-xs text-muted-foreground">
                    {zeradas} de {g.linhas.length} {g.linhas.length === 1 ? "manutenção zerada" : "manutenções zeradas"}
                    {g.saldo > 0 && ` · restam ${formatarBRL(g.saldo)}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold tabular-nums">{formatarBRL(g.descontado)}</span>
                  <ChevronDown
                    className={cn("h-4 w-4 text-muted-foreground transition-transform", estaAberto && "rotate-180")}
                  />
                </div>
              </button>
              {estaAberto && (
                <div className="space-y-3 bg-muted/30 px-3 pb-3 pt-1">
                  {g.reservas.length > 0 && (
                    <div>
                      <div className="mb-1 text-xs font-medium text-muted-foreground">Reservas usadas</div>
                      <ul className="space-y-1">
                        {g.reservas.map((r, i) => (
                          <li key={i} className="flex justify-between gap-3 text-xs tabular-nums">
                            <span>
                              Reserva {r.date ? formatarDia(r.date) : ""} · repasse {formatarBRL(r.owner_value_cents ?? 0)}
                            </span>
                            <span className="font-medium">−{formatarBRL(r.coverage_cents ?? 0)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div>
                    <div className="mb-1 text-xs font-medium text-muted-foreground">Manutenções</div>
                    <ul className="space-y-1.5">
                      {g.linhas.map(({ c, devido: d, coberto }) => {
                        const zerada = coberto >= d;
                        return (
                          <li key={c.id} className="flex items-start justify-between gap-3 text-sm">
                            <div className="min-w-0">
                              <div className="truncate">{c.title?.trim() || "Manutenção"}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatarBRL(d)}
                                {(c.management_contribution_cents ?? 0) > 0 && ` de ${formatarBRL(c.amount_cents ?? 0)}`}
                                {c.property?.name && ` · ${c.property.name}`}
                              </div>
                            </div>
                            <div className="text-right tabular-nums">
                              <div className="font-medium">−{formatarBRL(coberto)}</div>
                              <div className={cn("text-xs", zerada ? "text-success" : "text-warning")}>
                                {zerada ? "Zerada" : `Ficou ${formatarBRL(d - coberto)}`}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </CaixaOperacao>
  );
}
