import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { EmptyState } from "@/components/ui/empty-state";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { formatBRL } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronDown, ChevronRight, Wallet, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReservationSnapshot {
  date: string;
  owner_value_cents?: number;
  coverage_cents?: number;
  owner_receives_cents?: number;
  kind?: string;
  description?: string;
  amount_cents?: number;
}


interface CreditApplication {
  id: string;
  amount_applied_cents: number;
  applied_at: string;
  charge: { id: string; title: string | null } | null;
}

interface CreditRow {
  id: string;
  owner_id: string;
  origin_type?: string | null;
  origin_note: string | null;

  origin_reservations: ReservationSnapshot[] | null;
  initial_amount_cents: number;
  remaining_amount_cents: number;
  status: string;
  created_at: string;
  owner?: { name: string | null } | null;
  applications: CreditApplication[];
}

interface Props {
  /** When set, only this owner's retentions are listed (owner view). Omit for team view. */
  ownerId?: string;
  /** Section heading */
  title?: string;
  emptyDescription?: string;
  /** Render nothing instead of an empty state when there are no retentions */
  hideWhenEmpty?: boolean;
}

export function ReserveRetentionsHistory({
  ownerId,
  title = "Débitos e créditos registrados",
  emptyDescription = "Nenhum débito retroativo ou registro avulso até o momento.",
  hideWhenEmpty = false,
}: Props) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const { data: credits, isLoading } = useQuery({
    queryKey: ["reserve-retentions", ownerId ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("owner_credits")
        .select(
          `id, owner_id, origin_type, origin_note, origin_reservations, initial_amount_cents,
           remaining_amount_cents, status, created_at,
           owner:profiles!owner_credits_owner_id_fkey(name),
           applications:owner_credit_applications(
             id, amount_applied_cents, applied_at,
             charge:charges!owner_credit_applications_charge_id_fkey(id, title)
           )`
        )
        .in("origin_type", ["reserve_retention", "manual_adjustment"])
        .order("created_at", { ascending: false });

      if (ownerId) query = query.eq("owner_id", ownerId);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as CreditRow[];
    },
  });

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (isLoading) return hideWhenEmpty ? null : <SectionSkeleton />;

  if (!credits || credits.length === 0) {
    if (hideWhenEmpty) return null;
    return (
      <EmptyState
        icon={<Receipt className="h-6 w-6" />}
        title="Sem registros"
        description={emptyDescription}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">{title}</h3>
        <Badge variant="secondary">{credits.length}</Badge>
      </div>

      {credits.map((credit) => {
        const isOpen = openIds.has(credit.id);
        const reservations = credit.origin_reservations ?? [];
        const applied = credit.initial_amount_cents - (credit.remaining_amount_cents ?? 0);
        const isManual = credit.origin_type === "manual_adjustment";
        const manualEntry = isManual ? reservations[0] : undefined;


        return (
          <Card key={credit.id} className="overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(credit.id)}
              className="w-full text-left p-3 flex items-start gap-3 hover:bg-muted/40 transition-colors"
            >
              {isOpen ? (
                <ChevronDown className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {!ownerId && (
                    <span className="font-medium truncate">
                      {credit.owner?.name ?? "Proprietário"}
                    </span>
                  )}
                  <Badge
                    variant={credit.remaining_amount_cents > 0 ? "default" : "secondary"}
                    className={cn(
                      "text-xs",
                      credit.remaining_amount_cents > 0 && "bg-success text-success-foreground"
                    )}
                  >
                    {credit.remaining_amount_cents > 0
                      ? `Saldo credor ${formatBRL(credit.remaining_amount_cents)}`
                      : "Totalmente abatido"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {isManual ? "Registro avulso" : "Retenção em reserva"}
                  {credit.origin_note ? ` · ${credit.origin_note}` : ""} · registrado em{" "}
                  {format(new Date(credit.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-semibold">{formatBRL(credit.initial_amount_cents)}</p>
                <p className="text-xs text-muted-foreground">{isManual ? "registrado" : "retido"}</p>
              </div>
            </button>

            {isOpen && (
              <div className="border-t px-3 py-3 space-y-4 bg-muted/20">
                {isManual ? (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                      O que aconteceu
                    </p>
                    <p className="text-xs text-foreground whitespace-pre-wrap">
                      {manualEntry?.description ?? credit.origin_note ?? "—"}
                    </p>
                    {manualEntry?.date && (
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Data do ocorrido:{" "}
                        {format(new Date(manualEntry.date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                    )}
                  </div>
                ) : (
                  /* Reservas utilizadas */
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                      Reservas utilizadas ({reservations.length})
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="text-muted-foreground">
                          <tr>
                            <th className="text-left py-1">Check-in</th>
                            <th className="text-right py-1">Valor da reserva</th>
                            <th className="text-right py-1">Retido</th>
                            <th className="text-right py-1">Repassado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reservations.map((r, i) => (
                            <tr key={`${r.date}-${i}`} className="border-t">
                              <td className="py-1">
                                {r.date
                                  ? format(new Date(r.date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })
                                  : "—"}
                              </td>
                              <td className="py-1 text-right">{formatBRL(r.owner_value_cents ?? 0)}</td>
                              <td className="py-1 text-right text-destructive">
                                - {formatBRL(r.coverage_cents ?? 0)}
                              </td>
                              <td className="py-1 text-right font-medium">
                                {formatBRL(r.owner_receives_cents ?? 0)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}


                {/* Cobranças abatidas */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    Cobranças abatidas ({credit.applications?.length ?? 0}) ·{" "}
                    {formatBRL(applied)} aplicados
                  </p>
                  {credit.applications?.length ? (
                    <ul className="space-y-1">
                      {[...credit.applications]
                        .sort((a, b) => (a.applied_at < b.applied_at ? -1 : 1))
                        .map((app) => (
                          <li key={app.id} className="flex justify-between gap-2 text-xs">
                            <span className="truncate text-foreground">
                              {app.charge?.title ?? "Cobrança"}
                            </span>
                            <span className="shrink-0 font-medium text-success">
                              - {formatBRL(app.amount_applied_cents)}
                            </span>
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Nenhuma cobrança abatida por esta retenção ainda.
                    </p>
                  )}
                </div>

                {credit.remaining_amount_cents > 0 && (
                  <div className="rounded-md border border-success/30 bg-success/5 p-2 text-xs text-foreground">
                    Sobra de <strong>{formatBRL(credit.remaining_amount_cents)}</strong> disponível
                    como saldo credor para abater cobranças futuras.
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
