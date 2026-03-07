import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Hotel, CalendarDays, User, QrCode } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface BookingCommission {
  id: string;
  guest_name: string | null;
  check_in: string;
  check_out: string;
  reservation_amount_cents: number;
  commission_percent: number;
  commission_cents: number;
  cleaning_fee_cents: number;
  total_due_cents: number;
  status: string;
  due_date: string | null;
  notes: string | null;
  created_at: string;
  property?: { name: string } | null;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft:              { label: "Rascunho",        className: "bg-muted text-muted-foreground" },
  sent:               { label: "Aguardando",      className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  pendente:           { label: "Pendente",        className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" },
  overdue:            { label: "Vencida",         className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  paid:               { label: "Pago",            className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  pago_no_vencimento: { label: "Pago no Venc.",   className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  pago_antecipado:    { label: "Pago Antecipado", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  pago_com_atraso:    { label: "Pago c/ Atraso",  className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" },
  cancelled:          { label: "Cancelado",       className: "bg-muted text-muted-foreground" },
};

export default function MinhasComissoesBooking() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (profile && profile.role !== "owner") navigate("/");
  }, [profile, navigate]);

  const { data: commissions = [], isLoading } = useQuery({
    queryKey: ["owner-booking-commissions-all", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_commissions")
        .select("id, guest_name, check_in, check_out, reservation_amount_cents, commission_percent, commission_cents, cleaning_fee_cents, total_due_cents, status, due_date, notes, created_at, property:property_id(name)")
        .eq("owner_id", user!.id)
        .not("status", "eq", "cancelled")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as BookingCommission[];
    },
  });

  const pending = commissions.filter(c => ["sent", "pendente", "overdue"].includes(c.status));
  const paid    = commissions.filter(c => ["paid", "pago_no_vencimento", "pago_antecipado", "pago_com_atraso"].includes(c.status));
  const totalPending = pending.reduce((s, c) => s + c.total_due_cents, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto flex h-14 items-center gap-3 px-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/minha-caixa")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Hotel className="h-5 w-5 text-primary" />
            <h1 className="text-base font-semibold">Comissões Booking</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-lg space-y-4">

        {/* Resumo */}
        {pending.length > 0 && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="pt-4 pb-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{pending.length} cobrança{pending.length > 1 ? "s" : ""} em aberto</p>
                <p className="text-2xl font-bold text-destructive">{formatBRL(totalPending)}</p>
              </div>
              <div className="flex items-center gap-1 text-primary text-sm font-medium">
                <QrCode className="h-4 w-4" />
                <span>Somente PIX</span>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
          </div>
        )}

        {/* Pendentes */}
        {pending.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-destructive">Aguardando pagamento</h2>
            {pending.map(c => (
              <CommissionCard key={c.id} commission={c} onClick={() => navigate(`/minha-comissao-booking/${c.id}`)} />
            ))}
          </div>
        )}

        {/* Pagas */}
        {paid.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Pagas</h2>
            {paid.map(c => (
              <CommissionCard key={c.id} commission={c} onClick={() => navigate(`/minha-comissao-booking/${c.id}`)} faded />
            ))}
          </div>
        )}

        {!isLoading && commissions.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Hotel className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhuma cobrança de comissão Booking encontrada.</p>
          </div>
        )}
      </main>
    </div>
  );
}

function CommissionCard({
  commission: c,
  onClick,
  faded = false,
}: {
  commission: BookingCommission;
  onClick: () => void;
  faded?: boolean;
}) {
  const cfg = STATUS_CONFIG[c.status] || { label: c.status, className: "bg-muted text-muted-foreground" };
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl border hover:bg-accent/50 transition-colors space-y-2 ${faded ? "bg-muted/20 opacity-70" : "bg-card"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate font-medium">{c.guest_name || "Hóspede"}</span>
          </div>
          {c.property?.name && (
            <p className="text-xs text-muted-foreground truncate">{c.property.name}</p>
          )}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3 w-3 shrink-0" />
            <span>
              {format(new Date(c.check_in + "T12:00:00"), "dd/MM/yy", { locale: ptBR })}
              {" → "}
              {format(new Date(c.check_out + "T12:00:00"), "dd/MM/yy", { locale: ptBR })}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`text-base font-bold ${faded ? "line-through text-muted-foreground" : ""}`}>
            {formatBRL(c.total_due_cents)}
          </span>
          <Badge className={`text-xs px-2 py-0 ${cfg.className}`}>{cfg.label}</Badge>
        </div>
      </div>

      {/* Breakdown */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground border-t pt-2">
        <span>Reserva: {formatBRL(c.reservation_amount_cents)}</span>
        <span>•</span>
        <span>Comissão {c.commission_percent}%: {formatBRL(c.commission_cents)}</span>
        <span>•</span>
        <span>Limpeza: {formatBRL(c.cleaning_fee_cents)}</span>
      </div>
    </button>
  );
}
