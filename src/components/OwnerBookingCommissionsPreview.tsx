import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  Hotel,
  CalendarDays,
  QrCode,
  User,
} from "lucide-react";
import { formatBRL, formatDate } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface BookingCommission {
  id: string;
  guest_name: string | null;
  check_in: string;
  check_out: string;
  total_due_cents: number;
  commission_percent: number;
  status: string;
  due_date: string | null;
  property?: { name: string } | null;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft:              { label: "Rascunho",        className: "bg-muted text-muted-foreground" },
  sent:               { label: "Aguardando",      className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  pendente:           { label: "Pendente",         className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" },
  overdue:            { label: "Vencida",          className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  paid:               { label: "Pago",             className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  pago_no_vencimento: { label: "Pago no Venc.",    className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  pago_antecipado:    { label: "Pago Antecipado",  className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  pago_com_atraso:    { label: "Pago c/ Atraso",   className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" },
  cancelled:          { label: "Cancelado",        className: "bg-muted text-muted-foreground" },
};

const ACTIVE_STATUSES = ["sent", "pendente", "overdue"];
const PAID_STATUSES   = ["paid", "pago_no_vencimento", "pago_antecipado", "pago_com_atraso"];

export function OwnerBookingCommissionsPreview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [openPending, setOpenPending] = useState(true);
  const [openPaid, setOpenPaid]       = useState(false);

  const { data: commissions = [], isLoading } = useQuery({
    queryKey: ["owner-booking-commissions", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_commissions")
        .select("id, guest_name, check_in, check_out, total_due_cents, commission_percent, status, due_date, property:property_id(name)")
        .eq("owner_id", user!.id)
        .not("status", "eq", "cancelled")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as BookingCommission[];
    },
  });

  const pending = commissions.filter(c => ACTIVE_STATUSES.includes(c.status));
  const paid    = commissions.filter(c => PAID_STATUSES.includes(c.status));
  const totalPending = pending.reduce((s, c) => s + c.total_due_cents, 0);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (commissions.length === 0) return null;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Hotel className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-base">Comissões Booking</CardTitle>
            {pending.length > 0 && (
              <Badge variant="destructive" className="text-xs px-1.5 py-0.5">
                {pending.length}
              </Badge>
            )}
          </div>
          {totalPending > 0 && (
            <span className="text-sm font-semibold text-destructive">
              {formatBRL(totalPending)}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        {/* Pendentes */}
        {pending.length > 0 && (
          <Collapsible open={openPending} onOpenChange={setOpenPending}>
            <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium text-destructive">
              <span>Aguardando pagamento ({pending.length})</span>
              {openPending ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              {pending.slice(0, 5).map(c => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/minha-comissao-booking/${c.id}`)}
                  className="w-full text-left flex items-start justify-between gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <User className="h-3 w-3 shrink-0" />
                      <span className="truncate">{c.guest_name || "Hóspede"}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="h-3 w-3 shrink-0" />
                      <span>
                        {format(new Date(c.check_in + "T12:00:00"), "dd/MM", { locale: ptBR })}
                        {" – "}
                        {format(new Date(c.check_out + "T12:00:00"), "dd/MM/yy", { locale: ptBR })}
                      </span>
                    </div>
                    {c.property?.name && (
                      <p className="text-xs text-muted-foreground truncate">{c.property.name}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-sm font-semibold">{formatBRL(c.total_due_cents)}</span>
                    <Badge className={`text-xs px-1.5 py-0 ${STATUS_CONFIG[c.status]?.className || ""}`}>
                      {STATUS_CONFIG[c.status]?.label || c.status}
                    </Badge>
                    <div className="flex items-center gap-0.5 text-xs text-primary font-medium">
                      <QrCode className="h-3 w-3" />
                      <span>PIX</span>
                    </div>
                  </div>
                </button>
              ))}
              {pending.length > 5 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => navigate("/minhas-comissoes-booking")}
                >
                  Ver todas ({pending.length})
                </Button>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Pagas */}
        {paid.length > 0 && (
          <Collapsible open={openPaid} onOpenChange={setOpenPaid}>
            <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground">
              <span>Pagas ({paid.length})</span>
              {openPaid ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              {paid.slice(0, 3).map(c => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/minha-comissao-booking/${c.id}`)}
                  className="w-full text-left flex items-center justify-between gap-3 p-3 rounded-lg border bg-muted/30 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{c.guest_name || "Hóspede"}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(c.check_in + "T12:00:00"), "dd/MM/yy", { locale: ptBR })}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-sm font-medium line-through text-muted-foreground">{formatBRL(c.total_due_cents)}</span>
                    <Badge className={`text-xs px-1.5 py-0 ${STATUS_CONFIG[c.status]?.className || ""}`}>
                      {STATUS_CONFIG[c.status]?.label || c.status}
                    </Badge>
                  </div>
                </button>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={() => navigate("/minhas-comissoes-booking")}
        >
          Ver todas as comissões Booking
        </Button>
      </CardContent>
    </Card>
  );
}
