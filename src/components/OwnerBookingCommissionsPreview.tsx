import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown, ChevronRight, Hotel, CalendarDays, QrCode, User, Copy, Loader2, CheckCircle2,
} from "lucide-react";
import { formatBRL } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

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
  draft:              { label: "Rascunho",       className: "bg-muted text-muted-foreground" },
  sent:               { label: "Aguardando",     className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  pendente:           { label: "Pendente",       className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" },
  overdue:            { label: "Vencida",        className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  paid:               { label: "Pago",           className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  pago_no_vencimento: { label: "Pago no Venc.",  className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  pago_antecipado:    { label: "Pago Antecipado",className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  pago_com_atraso:    { label: "Pago c/ Atraso", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" },
  cancelled:          { label: "Cancelado",      className: "bg-muted text-muted-foreground" },
};

const ACTIVE_STATUSES = ["sent", "pendente", "overdue"];
const PAID_STATUSES   = ["paid", "pago_no_vencimento", "pago_antecipado", "pago_com_atraso"];

interface PixResult {
  pix_qr_code: string;
  pix_qr_code_base64: string;
  total_amount_cents: number;
}

export function OwnerBookingCommissionsPreview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [openPending, setOpenPending] = useState(true);
  const [openPaid,    setOpenPaid]    = useState(false);
  const [selected,    setSelected]    = useState<string[]>([]);
  const [generating,  setGenerating]  = useState(false);
  const [pixResult,   setPixResult]   = useState<PixResult | null>(null);
  const [pixOpen,     setPixOpen]     = useState(false);

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

  const pending      = commissions.filter(c => ACTIVE_STATUSES.includes(c.status));
  const paid         = commissions.filter(c => PAID_STATUSES.includes(c.status));
  const totalPending = pending.reduce((s, c) => s + c.total_due_cents, 0);
  const totalSelected = pending.filter(c => selected.includes(c.id)).reduce((s, c) => s + c.total_due_cents, 0);
  const allSelected   = pending.length > 0 && pending.every(c => selected.includes(c.id));

  const toggleAll = () => {
    if (allSelected) setSelected([]);
    else setSelected(pending.map(c => c.id));
  };

  const toggle = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleGeneratePix = async () => {
    if (selected.length === 0) return;
    try {
      setGenerating(true);
      const { data, error } = await supabase.functions.invoke("create-booking-pix", {
        body: { commissionIds: selected },
      });
      if (error) throw error;
      setPixResult(data as PixResult);
      setPixOpen(true);
    } catch (err: any) {
      toast.error("Erro ao gerar PIX: " + (err.message || "tente novamente"));
    } finally {
      setGenerating(false);
    }
  };

  const copyPix = () => {
    if (!pixResult?.pix_qr_code) return;
    navigator.clipboard.writeText(pixResult.pix_qr_code);
    toast.success("Código PIX copiado!");
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3"><Skeleton className="h-5 w-48" /></CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (commissions.length === 0) return null;

  return (
    <>
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Hotel className="h-4 w-4 text-primary" />
              </div>
              <CardTitle className="text-base">Comissões Booking</CardTitle>
              {pending.length > 0 && (
                <Badge variant="destructive" className="text-xs px-1.5 py-0.5">{pending.length}</Badge>
              )}
            </div>
            {totalPending > 0 && (
              <span className="text-sm font-semibold text-destructive">{formatBRL(totalPending)}</span>
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
                {/* Seleção em massa */}
                <div className="flex items-center justify-between px-1 pb-1 border-b">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground select-none">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    Selecionar todas
                  </label>
                  {selected.length > 0 && (
                    <span className="text-xs font-medium text-primary">
                      {selected.length} selecionada{selected.length > 1 ? "s" : ""} · {formatBRL(totalSelected)}
                    </span>
                  )}
                </div>

                {pending.map(c => {
                  const cfg = STATUS_CONFIG[c.status] || { label: c.status, className: "bg-muted text-muted-foreground" };
                  return (
                    <div
                      key={c.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${selected.includes(c.id) ? "bg-primary/5 border-primary/30" : "hover:bg-accent/50"}`}
                      onClick={() => toggle(c.id)}
                    >
                      <Checkbox
                        checked={selected.includes(c.id)}
                        onCheckedChange={() => toggle(c.id)}
                        onClick={e => e.stopPropagation()}
                        className="mt-0.5 shrink-0"
                      />
                      <div
                        className="flex-1 min-w-0 space-y-0.5"
                        onClick={e => { e.stopPropagation(); navigate(`/minha-comissao-booking/${c.id}`); }}
                      >
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
                            {format(new Date(c.check_in + "T12:00:00"), "dd/MM", { locale: ptBR })}
                            {" – "}
                            {format(new Date(c.check_out + "T12:00:00"), "dd/MM/yy", { locale: ptBR })}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-sm font-semibold">{formatBRL(c.total_due_cents)}</span>
                        <Badge className={`text-xs px-1.5 py-0 ${cfg.className}`}>{cfg.label}</Badge>
                      </div>
                    </div>
                  );
                })}

                {/* Botão Pagar via PIX */}
                {selected.length > 0 && (
                  <Button
                    className="w-full gap-2 mt-1"
                    onClick={handleGeneratePix}
                    disabled={generating}
                  >
                    {generating ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Gerando PIX...</>
                    ) : (
                      <><QrCode className="h-4 w-4" /> Gerar PIX · {formatBRL(totalSelected)}</>
                    )}
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

      {/* Popup PIX */}
      <Dialog open={pixOpen} onOpenChange={setPixOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary" />
              Pagar via PIX
            </DialogTitle>
          </DialogHeader>

          {pixResult && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">{formatBRL(pixResult.total_amount_cents)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {selected.length} cobrança{selected.length > 1 ? "s" : ""} de comissão Booking
                </p>
              </div>

              {pixResult.pix_qr_code_base64 && (
                <div className="flex justify-center p-3 bg-white rounded-xl border">
                  <img src={pixResult.pix_qr_code_base64} alt="QR Code PIX" className="w-52 h-52" />
                </div>
              )}

              <Button variant="outline" className="w-full gap-2" onClick={copyPix}>
                <Copy className="h-4 w-4" />
                Copiar código PIX copia e cola
              </Button>

              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>Após o pagamento, o status das cobranças será atualizado automaticamente.</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
