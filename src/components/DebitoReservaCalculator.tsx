import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Calculator, DollarSign, Copy, Check, Send, CalendarIcon, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface DebitoReservaCalculatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyName: string;
  totalDebtCents: number;
  chargeId?: string;
  chargeIds?: string[];
  onDebitConfirmed?: () => void;
}

interface ReservationInput {
  id: string;
  ownerValue: string;
  date: Date | undefined;
}

const DEFAULT_BASE_COMMISSION = "20";

const newReservation = (): ReservationInput => ({
  id: crypto.randomUUID(),
  ownerValue: "",
  date: undefined,
});

const parseValue = (value: string): number => {
  const normalized = value.replace(",", ".");
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : parsed;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export const DebitoReservaCalculator = ({
  open,
  onOpenChange,
  propertyName,
  totalDebtCents,
  chargeId,
  chargeIds,
  onDebitConfirmed,
}: DebitoReservaCalculatorProps) => {
  const { toast } = useToast();
  const [reservations, setReservations] = useState<ReservationInput[]>([newReservation()]);
  const [baseCommission, setBaseCommission] = useState<string>(DEFAULT_BASE_COMMISSION);
  const [copied, setCopied] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const baseCommissionNum = parseValue(baseCommission);
  const totalDebt = totalDebtCents / 100;

  // Sum of gross reservation values across all reservations
  const reservationData = reservations.map((r) => {
    const owner = parseValue(r.ownerValue);
    const gross = owner > 0 && baseCommissionNum < 100 ? owner / (1 - baseCommissionNum / 100) : 0;
    return { ...r, ownerNum: owner, gross };
  });

  const totalGross = reservationData.reduce((sum, r) => sum + r.gross, 0);
  const totalOwner = reservationData.reduce((sum, r) => sum + r.ownerNum, 0);

  // Single extra% applied to ALL reservations to cover the debt collectively
  const extraPercentExact = totalGross > 0 ? (totalDebt / totalGross) * 100 : 0;
  const extraPercentRounded = Math.ceil(extraPercentExact);
  const totalCommissionToSet = baseCommissionNum + extraPercentRounded;

  // Per reservation: how much it covers and what owner receives
  const perReservation = reservationData.map((r) => {
    const coverage = (extraPercentRounded / 100) * r.gross;
    const receives = Math.max(0, r.ownerNum - coverage);
    return { ...r, coverage, receives };
  });

  const totalCoverage = perReservation.reduce((sum, r) => sum + r.coverage, 0);
  const totalReceives = perReservation.reduce((sum, r) => sum + r.receives, 0);
  const remaining = Math.max(0, totalDebt - totalCoverage);

  const updateReservation = (id: string, patch: Partial<ReservationInput>) => {
    setReservations((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeReservation = (id: string) => {
    setReservations((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.id !== id)));
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(totalCommissionToSet.toFixed(0));
      setCopied(true);
      toast({ title: "Copiado!", description: "Comissão copiada" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Erro ao copiar", variant: "destructive" });
    }
  };

  const idsToProcess = chargeIds || (chargeId ? [chargeId] : []);
  const hasCharges = idsToProcess.length > 0;
  const allReservationsValid = perReservation.every((r) => r.ownerNum > 0 && r.date);
  const canConfirm =
    hasCharges && baseCommissionNum > 0 && allReservationsValid && perReservation.length > 0;

  const handleConfirmDebit = async () => {
    if (!canConfirm) {
      toast({ title: "Preencha todas as reservas (valor + data)", variant: "destructive" });
      return;
    }

    setIsConfirming(true);
    try {
      const reservationsPayload = perReservation.map((r) => ({
        date: format(r.date!, "yyyy-MM-dd"),
        owner_value_cents: Math.round(r.ownerNum * 100),
        owner_receives_cents: Math.round(r.receives * 100),
        coverage_cents: Math.round(r.coverage * 100),
      }));

      const { error } = await supabase.functions.invoke("debit-reserve", {
        body: {
          chargeIds: idsToProcess,
          reserveDate: reservationsPayload[0].date, // primary check-in for backward compat
          ownerValueCents: Math.round(totalOwner * 100),
          baseCommissionPercent: baseCommissionNum,
          extraCommissionPercent: extraPercentRounded,
          extraCommissionPercentExact: extraPercentExact,
          totalCommissionPercent: totalCommissionToSet,
          ownerReceivesCents: Math.round(totalReceives * 100),
          reservations: reservationsPayload,
        },
      });

      if (error) throw error;

      toast({
        title: "Débito confirmado!",
        description: `${idsToProcess.length} cobrança(s) em ${reservationsPayload.length} reserva(s).`,
      });
      onDebitConfirmed?.();
      onOpenChange(false);
      setReservations([newReservation()]);
    } catch (error: any) {
      toast({
        title: "Erro ao confirmar débito",
        description: error.message || "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Calculadora de Débito em Reserva
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium">{propertyName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-sm text-muted-foreground">Dívida Total a Cobrir</p>
              <p className="text-2xl font-bold text-destructive">{formatCurrency(totalDebt)}</p>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Label htmlFor="base-commission">Comissão Base (%)</Label>
            <Input
              id="base-commission"
              type="text"
              inputMode="decimal"
              placeholder="20"
              value={baseCommission}
              onChange={(e) => {
                const v = e.target.value;
                if (/^[0-9]*[,.]?[0-9]*$/.test(v) || v === "") setBaseCommission(v);
              }}
              className="text-lg"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                Reservas para cobrir a dívida
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setReservations((p) => [...p, newReservation()])}
              >
                <Plus className="h-3 w-3 mr-1" /> Adicionar reserva
              </Button>
            </div>

            {perReservation.map((r, idx) => (
              <Card key={r.id} className="border-muted">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Reserva {idx + 1}
                    </span>
                    {reservations.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeReservation(r.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="Valor proprietário R$"
                      value={r.ownerValue}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (/^[0-9]*[,.]?[0-9]*$/.test(v) || v === "")
                          updateReservation(r.id, { ownerValue: v });
                      }}
                    />
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "justify-start text-left font-normal",
                            !r.date && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {r.date ? format(r.date, "dd/MM/yy", { locale: ptBR }) : "Check-in"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={r.date}
                          onSelect={(d) => updateReservation(r.id, { date: d })}
                          locale={ptBR}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  {r.ownerNum > 0 && baseCommissionNum > 0 && extraPercentRounded > 0 && (
                    <div className="flex justify-between text-xs text-muted-foreground pt-1">
                      <span>Cobre: <strong className="text-warning">{formatCurrency(r.coverage)}</strong></span>
                      <span>Receberá: <strong className="text-foreground">{formatCurrency(r.receives)}</strong></span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {totalOwner > 0 && baseCommissionNum > 0 && (
            <>
              <Separator />

              <Card className="bg-gradient-to-r from-primary/20 to-primary/10 border-primary/30">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-1">
                    Comissão única a configurar em {perReservation.length} reserva(s)
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <p className="text-4xl font-bold text-primary">
                      {totalCommissionToSet.toFixed(0)}%
                    </p>
                    <Button variant="outline" size="icon" className="h-10 w-10" onClick={handleCopy}>
                      {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Base {baseCommissionNum.toFixed(0)}% + {extraPercentRounded}% extra (exato:{" "}
                    {extraPercentExact.toFixed(2).replace(".", ",")}%)
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-muted/50">
                <CardContent className="p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Valor total proprietário:</span>
                    <span className="font-medium">{formatCurrency(totalOwner)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Desconto total p/ dívida:</span>
                    <span className="font-medium text-destructive">- {formatCurrency(totalCoverage)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Proprietário receberá no total:</span>
                    <span className="font-bold">{formatCurrency(totalReceives)}</span>
                  </div>
                </CardContent>
              </Card>

              {remaining < 0.01 ? (
                <div className="text-center text-sm text-success bg-success/10 rounded-lg p-2">
                  ✓ Dívida coberta integralmente pelas reservas
                </div>
              ) : (
                <div className="text-center text-sm text-warning bg-warning/10 rounded-lg p-2">
                  ⚠️ Restará {formatCurrency(remaining)} de dívida — adicione mais reservas
                </div>
              )}

              {hasCharges && (
                <Button
                  onClick={handleConfirmDebit}
                  disabled={!canConfirm || isConfirming}
                  className="w-full"
                  size="lg"
                >
                  {isConfirming ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processando...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" /> Confirmar Débito e Notificar
                    </>
                  )}
                </Button>
              )}
            </>
          )}

          <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
            <strong>Como funciona:</strong> A mesma comissão extra é aplicada em todas as reservas
            adicionadas, distribuindo a dívida proporcionalmente ao valor de cada uma. O
            proprietário recebe um e-mail listando todas as reservas envolvidas.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
