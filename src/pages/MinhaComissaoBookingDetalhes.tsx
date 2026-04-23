import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { goBack } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Hotel, CalendarDays, User, QrCode, Building2, Copy, Percent, DollarSign } from "lucide-react";
import { formatBRL, formatDate } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { BookingCommissionChatDialog } from "@/components/BookingCommissionChatDialog";

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
  pix_qr_code: string | null;
  pix_qr_code_base64: string | null;
  paid_at: string | null;
  created_at: string;
  property?: { name: string } | null;
  owner?: { name: string; email: string } | null;
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

const PAID_STATUSES = ["paid", "pago_no_vencimento", "pago_antecipado", "pago_com_atraso"];

export default function MinhaComissaoBookingDetalhes() {
  const { id } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [chatOpen, setChatOpen] = useState(false);
  const [generatingPix, setGeneratingPix] = useState(false);

  useEffect(() => {
    if (profile && profile.role !== "owner") navigate("/");
  }, [profile, navigate]);

  const { data: commission, isLoading, refetch } = useQuery({
    queryKey: ["owner-booking-commission-detail", id],
    enabled: !!id && !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_commissions")
        .select("*, property:property_id(name), owner:owner_id(name, email)")
        .eq("id", id!)
        .eq("owner_id", user!.id)
        .single();

      if (error) throw error;
      return data as unknown as BookingCommission;
    },
  });

  const isPaid = PAID_STATUSES.includes(commission?.status || "");
  const cfg    = STATUS_CONFIG[commission?.status || ""] || { label: commission?.status, className: "bg-muted text-muted-foreground" };

  const handleGeneratePix = async () => {
    if (!commission) return;
    try {
      setGeneratingPix(true);
      const { data, error } = await supabase.functions.invoke("create-mercadopago-payment", {
        body: { commissionId: commission.id, paymentMethod: "pix" },
      });
      if (error) throw error;
      toast.success("PIX gerado com sucesso!");
      refetch();
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao gerar PIX: " + (err.message || "tente novamente"));
    } finally {
      setGeneratingPix(false);
    }
  };

  const copyPix = () => {
    if (!commission?.pix_qr_code) return;
    navigator.clipboard.writeText(commission.pix_qr_code);
    toast.success("Código PIX copiado!");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <header className="border-b bg-card/50 h-14" />
        <main className="container mx-auto px-4 py-6 max-w-lg space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </main>
      </div>
    );
  }

  if (!commission) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Cobrança não encontrada.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto flex h-14 items-center gap-3 px-4">
          <Button variant="ghost" size="icon" onClick={() => goBack(navigate, "/minhas-comissoes-booking")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Hotel className="h-5 w-5 text-primary" />
            <h1 className="text-base font-semibold">Comissão Booking</h1>
          </div>
          <div className="ml-auto">
            <Badge className={`${cfg.className}`}>{cfg.label}</Badge>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-lg space-y-4">

        {/* Resumo da reserva */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Detalhes da Reserva</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {commission.property?.name && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="h-4 w-4 shrink-0" />
                <span className="font-medium text-foreground">{commission.property.name}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4 shrink-0" />
              <span>{commission.guest_name || "Hóspede não informado"}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarDays className="h-4 w-4 shrink-0" />
              <span>
                Check-in: {format(new Date(commission.check_in + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
              </span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarDays className="h-4 w-4 shrink-0" />
              <span>
                Check-out: {format(new Date(commission.check_out + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
              </span>
            </div>
            {commission.notes && (
              <p className="text-xs text-muted-foreground border-t pt-2">{commission.notes}</p>
            )}
          </CardContent>
        </Card>

        {/* Breakdown financeiro */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Composição do Valor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor da reserva</span>
              <span>{formatBRL(commission.reservation_amount_cents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Comissão RIOS ({commission.commission_percent}%)</span>
              <span>{formatBRL(commission.commission_cents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Taxa de limpeza</span>
              <span>{formatBRL(commission.cleaning_fee_cents)}</span>
            </div>
            <div className="flex justify-between font-bold text-base border-t pt-2">
              <span>Total a pagar</span>
              <span className={isPaid ? "text-success" : "text-destructive"}>
                {formatBRL(commission.total_due_cents)}
              </span>
            </div>
            {isPaid && commission.paid_at && (
              <p className="text-xs text-success text-right">
                Pago em {format(new Date(commission.paid_at), "dd/MM/yyyy", { locale: ptBR })}
              </p>
            )}
          </CardContent>
        </Card>

        {/* PIX — só se não pago */}
        {!isPaid && (
          <Card className="border-primary/30">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <QrCode className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Pagar via PIX</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {commission.pix_qr_code_base64 ? (
                <>
                  <div className="flex justify-center p-3 bg-white rounded-lg border">
                  <img src={commission.pix_qr_code_base64} alt="QR Code PIX" className="w-48 h-48" />
                  </div>
                  <Button variant="outline" className="w-full gap-2" onClick={copyPix}>
                    <Copy className="h-4 w-4" />
                    Copiar código PIX copia e cola
                  </Button>
                </>
              ) : (
                <div className="space-y-3 text-center">
                  <p className="text-sm text-muted-foreground">
                    Clique abaixo para gerar o QR Code PIX para pagamento.
                  </p>
                  <Button
                    className="w-full gap-2"
                    onClick={handleGeneratePix}
                    disabled={generatingPix}
                  >
                    {generatingPix ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Gerando PIX...
                      </>
                    ) : (
                      <>
                        <QrCode className="h-4 w-4" />
                        Gerar PIX — {formatBRL(commission.total_due_cents)}
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    ⚠️ Pagamento exclusivo via PIX para comissões Booking
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Chat */}
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => setChatOpen(true)}
        >
          Tirar dúvidas sobre esta cobrança
        </Button>

        <BookingCommissionChatDialog
          commissionId={commission.id}
          open={chatOpen}
          onOpenChange={setChatOpen}
          title={`${commission.guest_name || "Hóspede"} — ${commission.property?.name || ""}`}
        />
      </main>
    </div>
  );
}
