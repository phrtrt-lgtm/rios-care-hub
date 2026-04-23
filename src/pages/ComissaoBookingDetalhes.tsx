import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { goBack } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Building2, User, CalendarDays, Percent, DollarSign,
  MessageSquare, Trash2, CheckCircle2, AlertCircle
} from "lucide-react";
import { formatBRL, formatDate } from "@/lib/format";
import { format, differenceInDays } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { BookingCommissionChatDialog } from "@/components/BookingCommissionChatDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";

interface BookingCommission {
  id: string;
  owner_id: string;
  property_id: string | null;
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
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  owner?: { name: string; email: string };
  property?: { name: string; cover_photo_url: string | null } | null;
}

const STATUS_OPTIONS = [
  { value: "draft", label: "Rascunho" },
  { value: "sent", label: "Enviada" },
  { value: "pendente", label: "Pendente" },
  { value: "overdue", label: "Vencida" },
  { value: "paid", label: "Pago" },
  { value: "pago_no_vencimento", label: "Pago no Venc." },
  { value: "pago_antecipado", label: "Pago Antecipado" },
  { value: "pago_com_atraso", label: "Pago c/ Atraso" },
  { value: "cancelled", label: "Cancelado" },
];

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  sent: { label: "Enviada", className: "bg-info/10 text-info dark:bg-blue-900/40 dark:text-blue-300" },
  pendente: { label: "Pendente", className: "bg-warning/10 text-warning dark:bg-yellow-900/40 dark:text-yellow-300" },
  overdue: { label: "Vencida", className: "bg-destructive/10 text-destructive dark:bg-red-900/40 dark:text-red-300" },
  paid: { label: "Pago", className: "bg-success/10 text-success dark:bg-green-900/40 dark:text-green-300" },
  pago_no_vencimento: { label: "Pago no Venc.", className: "bg-success/10 text-success dark:bg-green-900/40 dark:text-green-300" },
  pago_antecipado: { label: "Pago Antecipado", className: "bg-success/10 text-success dark:bg-emerald-900/40 dark:text-emerald-300" },
  pago_com_atraso: { label: "Pago c/ Atraso", className: "bg-warning/10 text-warning dark:bg-yellow-900/40 dark:text-yellow-300" },
  cancelled: { label: "Cancelado", className: "bg-muted text-muted-foreground" },
};

export default function ComissaoBookingDetalhes() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [commission, setCommission] = useState<BookingCommission | null>(null);
  const [loading, setLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const isTeam = ["admin", "agent", "maintenance"].includes(profile?.role || "");

  useEffect(() => {
    if (id) fetchCommission();
  }, [id]);

  const fetchCommission = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("booking_commissions")
        .select("*")
        .eq("id", id!)
        .single();

      if (error) throw error;

      const [ownerRes, propRes] = await Promise.all([
        supabase.from("profiles").select("name, email").eq("id", data.owner_id).single(),
        data.property_id
          ? supabase.from("properties").select("name, cover_photo_url").eq("id", data.property_id).single()
          : Promise.resolve({ data: null }),
      ]);

      setCommission({
        ...data,
        owner: ownerRes.data || { name: "N/A", email: "N/A" },
        property: propRes.data || null,
      });
    } catch (err) {
      console.error(err);
      toast({ title: "Comissão não encontrada", variant: "destructive" });
      navigate("/booking-comissoes");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!commission) return;
    setUpdatingStatus(true);
    try {
      const updates: Record<string, unknown> = { status: newStatus };
      const PAID = ["paid", "pago_no_vencimento", "pago_antecipado", "pago_com_atraso"];
      if (PAID.includes(newStatus) && !commission.paid_at) {
        updates.paid_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from("booking_commissions")
        .update(updates)
        .eq("id", commission.id);
      if (error) throw error;
      toast({ title: "Status atualizado!" });
      fetchCommission();
    } catch (err: any) {
      toast({ title: "Erro ao atualizar status", description: err.message, variant: "destructive" });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleArchive = async () => {
    if (!commission) return;
    try {
      const { error } = await supabase
        .from("booking_commissions")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", commission.id);
      if (error) throw error;
      toast({ title: "Cobrança arquivada" });
      navigate("/booking-comissoes");
    } catch (err: any) {
      toast({ title: "Erro ao arquivar", description: err.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!commission) return null;

  const st = STATUS_CONFIG[commission.status] || { label: commission.status, className: "bg-muted" };
  const nights = differenceInDays(new Date(commission.check_out), new Date(commission.check_in));
  const isPaid = ["paid", "pago_no_vencimento", "pago_antecipado", "pago_com_atraso"].includes(commission.status);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Button variant="ghost" size="sm" onClick={() => goBack(navigate, "/minhas-comissoes-booking")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          <div className="flex items-center gap-2">
            {isTeam && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setArchiveDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setChatOpen(true)}>
              <MessageSquare className="mr-2 h-4 w-4" />
              Chat
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl space-y-4">
        {/* Property + Status */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              {commission.property?.cover_photo_url ? (
                <img
                  src={commission.property.cover_photo_url}
                  alt={commission.property.name}
                  className="h-14 w-14 rounded-lg object-cover"
                />
              ) : (
                <div className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{commission.property?.name || "Sem Imóvel"}</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="h-3.5 w-3.5" />
                  <span>{commission.owner?.name}</span>
                </div>
                <Badge className={`mt-1 text-xs ${st.className}`}>{st.label}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Reservation info */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              Dados da Reserva
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4 px-4 space-y-2 text-sm">
            {commission.guest_name && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Hóspede</span>
                <span className="font-medium">{commission.guest_name}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Check-in</span>
              <span className="font-medium">{format(new Date(commission.check_in), "dd/MM/yyyy")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Check-out</span>
              <span className="font-medium">{format(new Date(commission.check_out), "dd/MM/yyyy")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Noites</span>
              <span className="font-medium">{nights}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor da Reserva</span>
              <span className="font-medium">{formatBRL(commission.reservation_amount_cents)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Financial breakdown */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Detalhamento Financeiro
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4 px-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                <Percent className="h-3.5 w-3.5" />
                Comissão ({commission.commission_percent}%)
              </span>
              <span className="font-medium">{formatBRL(commission.commission_cents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Taxa de Limpeza</span>
              <span className="font-medium">{formatBRL(commission.cleaning_fee_cents)}</span>
            </div>
            <div className="flex justify-between font-bold text-primary border-t pt-2 mt-1">
              <span>Total a Cobrar</span>
              <span className="text-lg">{formatBRL(commission.total_due_cents)}</span>
            </div>
            {commission.due_date && (
              <div className="flex justify-between text-muted-foreground">
                <span>Vencimento</span>
                <span>{format(new Date(commission.due_date), "dd/MM/yyyy")}</span>
              </div>
            )}
            {isPaid && commission.paid_at && (
              <div className="flex justify-between text-success">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Pago em
                </span>
                <span>{formatDate(commission.paid_at)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        {commission.notes && (
          <Card>
            <CardContent className="pt-4 pb-4 px-4">
              <p className="text-sm text-muted-foreground mb-1">Observações</p>
              <p className="text-sm whitespace-pre-wrap">{commission.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Status change (team only) */}
        {isTeam && (
          <Card>
            <CardContent className="pt-4 pb-4 px-4">
              <p className="text-sm font-medium mb-2">Alterar Status</p>
              <Select
                value={commission.status}
                onValueChange={handleStatusChange}
                disabled={updatingStatus}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground text-center">
          Criada em {formatDate(commission.created_at)}
        </p>
      </main>

      <BookingCommissionChatDialog
        open={chatOpen}
        onOpenChange={setChatOpen}
        commissionId={commission.id}
        title={`${commission.property?.name || "Sem imóvel"} – ${commission.guest_name || "Hóspede"}`}
      />

      <AlertDialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar cobrança?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa comissão será arquivada e não aparecerá mais na lista ativa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive} className="bg-destructive text-destructive-foreground">
              Arquivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
