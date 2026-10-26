import { useMemo, useState } from "react";
import { ChevronDown, Landmark } from "lucide-react";
import { CaixaOperacao, SeloContagem } from "@/components/painel/CaixaOperacao";
import { formatarBRL } from "@/lib/cobrancaMeta";
import { cn } from "@/lib/utils";

interface CobrancaDebitada {
  id: string;
  title: string;
  status: string;
  amount_cents: number | null;
  management_contribution_cents: number | null;
  reserve_debit_date?: string | null;
  debited_at?: string | null;
  property?: { name?: string | null } | null;
}

/** Lê "aaaa-mm-dd" como dia local (sem deslocar pelo fuso). */
function dataDoDebito(c: CobrancaDebitada): string | null {
  const bruto = c.reserve_debit_date || c.debited_at?.slice(0, 10) || null;
  return bruto;
}

function formatarDia(dia: string) {
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
}

/**
 * Débitos em reserva do proprietário, agrupados pela data do débito.
 * Usa as cobranças já carregadas pela página (status "debited").
 */
export function DebitosReserva({ cobrancas, ano }: { cobrancas: CobrancaDebitada[]; ano?: number }) {
  const [aberto, setAberto] = useState<string | null>(null);

  const grupos = useMemo(() => {
    const mapa = new Map<string, CobrancaDebitada[]>();
    for (const c of cobrancas) {
      if (c.status !== "debited") continue;
      const dia = dataDoDebito(c);
      if (!dia) continue;
      if (ano && Number(dia.slice(0, 4)) !== ano) continue;
      mapa.set(dia, [...(mapa.get(dia) ?? []), c]);
    }
    return [...mapa.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([dia, itens]) => ({
        dia,
        itens: itens.sort(
          (a, b) => devido(b) - devido(a),
        ),
        total: itens.reduce((s, c) => s + devido(c), 0),
      }));
  }, [cobrancas, ano]);

  if (grupos.length === 0) return null;
  const totalGeral = grupos.reduce((s, g) => s + g.total, 0);

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
                    {g.itens.length} {g.itens.length === 1 ? "item" : "itens"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold tabular-nums">{formatarBRL(g.total)}</span>
                  <ChevronDown
                    className={cn("h-4 w-4 text-muted-foreground transition-transform", estaAberto && "rotate-180")}
                  />
                </div>
              </button>
              {estaAberto && (
                <ul className="space-y-1 bg-muted/30 px-3 pb-3 pt-1">
                  {g.itens.map((c) => (
                    <li key={c.id} className="flex items-start justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <div className="truncate">{c.title?.trim() || "Manutenção"}</div>
                        {c.property?.name && (
                          <div className="text-xs text-muted-foreground">{c.property.name}</div>
                        )}
                      </div>
                      <div className="text-right tabular-nums">
                        <div className="font-medium">{formatarBRL(devido(c))}</div>
                        {(c.management_contribution_cents ?? 0) > 0 && (
                          <div className="text-xs text-muted-foreground">
                            de {formatarBRL(c.amount_cents ?? 0)}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </CaixaOperacao>
  );
}

function devido(c: CobrancaDebitada) {
  return (c.amount_cents ?? 0) - (c.management_contribution_cents ?? 0);
}
