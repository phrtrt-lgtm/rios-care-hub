import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { goBack } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Hotel, CalendarDays, User, QrCode, Copy, Zap, CheckSquare, Square } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";

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
  sent:               { label: "Aguardando",      className: "bg-info/10 text-info dark:bg-blue-900/40 dark:text-blue-300" },
  pendente:           { label: "Pendente",        className: "bg-warning/10 text-warning dark:bg-yellow-900/40 dark:text-yellow-300" },
  overdue:            { label: "Vencida",         className: "bg-destructive/10 text-destructive dark:bg-red-900/40 dark:text-red-300" },
  paid:               { label: "Pago",            className: "bg-success/10 text-success dark:bg-green-900/40 dark:text-green-300" },
  pago_no_vencimento: { label: "Pago no Venc.",   className: "bg-success/10 text-success dark:bg-green-900/40 dark:text-green-300" },
  pago_antecipado:    { label: "Pago Antecipado", className: "bg-success/10 text-success dark:bg-emerald-900/40 dark:text-emerald-300" },
  pago_com_atraso:    { label: "Pago c/ Atraso",  className: "bg-warning/10 text-warning dark:bg-yellow-900/40 dark:text-yellow-300" },
  cancelled:          { label: "Cancelado",       className: "bg-muted text-muted-foreground" },
};

const OPEN_STATUSES = ["sent", "pendente", "overdue"];

export default function MinhasComissoesBooking() {
  useScrollRestoration();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generatingPayment, setGeneratingPayment] = useState(false);
  const [groupPayment, setGroupPayment] = useState<{
    pix_qr_code: string;
    pix_qr_code_base64: string;
    total_amount: number;
  } | null>(null);

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

  const pending = commissions.filter(c => OPEN_STATUSES.includes(c.status));
  const paid    = commissions.filter(c => !OPEN_STATUSES.includes(c.status) && c.status !== "cancelled");
  const totalPending = pending.reduce((s, c) => s + c.total_due_cents, 0);

  const toggleSelect = (id: string) => {
    setGroupPayment(null);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setGroupPayment(null);
    if (selectedIds.size === pending.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pending.map(c => c.id)));
    }
  };

  const totalSelected = [...selectedIds].reduce((sum, id) => {
    const c = commissions.find(x => x.id === id);
    return sum + (c?.total_due_cents || 0);
  }, 0);

  const handleGenerateGroupPayment = async () => {
    try {
      setGeneratingPayment(true);
      setGroupPayment(null);

      const { data, error } = await supabase.functions.invoke("create-group-booking-payment", {
        body: { commissionIds: [...selectedIds] },
      });

      if (error) throw error;

      setGroupPayment({
        pix_qr_code: data.pix_qr_code,
        pix_qr_code_base64: data.pix_qr_code_base64,
        total_amount: data.total_amount,
      });

      toast.success("PIX agrupado gerado com sucesso!");
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao gerar PIX: " + (err.message || "tente novamente"));
    } finally {
      setGeneratingPayment(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto flex h-14 items-center gap-3 px-4">
          <Button variant="ghost" size="icon" onClick={() => goBack(navigate, "/minha-caixa")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Hotel className="h-5 w-5 text-primary" />
            <h1 className="text-base font-semibold">Comissões Booking</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-lg space-y-4">

        {/* Resumo total pendente */}
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

        {/* Painel de Pagamento Agrupado */}
        {pending.length > 1 && (
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <QrCode className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Pagamento Agrupado</CardTitle>
                  <CardDescription className="text-xs mt-0.5">Pague várias comissões de uma só vez via PIX</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Selecionar todas */}
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {selectedIds.size === pending.length ? (
                  <CheckSquare className="h-4 w-4 text-primary" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                {selectedIds.size === pending.length ? "Desmarcar todas" : "Selecionar todas"}
              </button>

              {selectedIds.size > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-background rounded-xl border-2 border-primary/20">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {selectedIds.size} {selectedIds.size === 1 ? "cobrança" : "cobranças"} selecionada{selectedIds.size > 1 ? "s" : ""}
                      </p>
                      <p className="text-xl font-bold text-primary">{formatBRL(totalSelected)}</p>
                    </div>
                    <Button
                      onClick={handleGenerateGroupPayment}
                      disabled={generatingPayment}
                      size="sm"
                      className="gap-2"
                    >
                      {generatingPayment ? (
                        <>
                          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          Gerando...
                        </>
                      ) : (
                        <>
                          <Zap className="h-3.5 w-3.5" />
                          Gerar PIX
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Loading */}
                  {generatingPayment && (
                    <div className="flex flex-col items-center gap-3 py-6">
                      <div className="relative">
                        <img src="/logo.png" alt="RIOS" className="h-12 w-12 animate-pulse" />
                        <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                      </div>
                      <p className="text-xs text-muted-foreground animate-pulse">Gerando PIX agrupado...</p>
                    </div>
                  )}

                  {/* QR Code gerado */}
                  {groupPayment && !generatingPayment && (
                    <div className="space-y-3 animate-fade-in">
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-success/10 text-success rounded-full border border-success/30 text-xs font-medium">
                        <div className="h-1.5 w-1.5 bg-success rounded-full animate-pulse" />
                        PIX gerado com sucesso!
                      </div>
                      {groupPayment.pix_qr_code_base64 && (
                        <div className="flex justify-center p-3 bg-white rounded-xl border">
                          <img src={groupPayment.pix_qr_code_base64} alt="QR Code PIX" className="w-44 h-44" />
                        </div>
                      )}
                      {groupPayment.pix_qr_code && (
                        <Button
                          variant="outline"
                          className="w-full gap-2"
                          onClick={() => {
                            navigator.clipboard.writeText(groupPayment.pix_qr_code);
                            toast.success("Código PIX copiado!");
                          }}
                        >
                          <Copy className="h-4 w-4" />
                          Copiar código PIX copia e cola
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {selectedIds.size === 0 && (
                <p className="text-xs text-muted-foreground">
                  Selecione as cobranças abaixo usando os checkboxes para pagar juntas.
                </p>
              )}
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
              <CommissionCard
                key={c.id}
                commission={c}
                onClick={() => navigate(`/minha-comissao-booking/${c.id}`)}
                selectable
                selected={selectedIds.has(c.id)}
                onToggleSelect={() => toggleSelect(c.id)}
              />
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
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  commission: BookingCommission;
  onClick: () => void;
  faded?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const cfg = STATUS_CONFIG[c.status] || { label: c.status, className: "bg-muted text-muted-foreground" };
  return (
    <div
      className={`w-full text-left p-4 rounded-xl border transition-colors space-y-2 ${
        selected
          ? "bg-primary/10 border-primary/40"
          : faded
          ? "bg-muted/20 opacity-70 border-border"
          : "bg-card hover:bg-accent/50 border-border"
      }`}
    >
      <div className="flex items-start gap-3">
        {selectable && (
          <div
            className="mt-0.5 shrink-0"
            onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
          >
            <Checkbox checked={selected} onCheckedChange={() => onToggleSelect?.()} />
          </div>
        )}
        <button onClick={onClick} className="flex-1 text-left space-y-2">
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
          <div className="flex items-center gap-3 text-xs text-muted-foreground border-t pt-2">
            <span>Reserva: {formatBRL(c.reservation_amount_cents)}</span>
            <span>•</span>
            <span>Comissão {c.commission_percent}%: {formatBRL(c.commission_cents)}</span>
            <span>•</span>
            <span>Limpeza: {formatBRL(c.cleaning_fee_cents)}</span>
          </div>
        </button>
      </div>
    </div>
  );
}
