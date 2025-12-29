import { useState, useEffect } from "react";
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
import { Calculator, Percent, DollarSign, ArrowRight } from "lucide-react";

interface DebitoReservaCalculatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyName: string;
  totalDebtCents: number;
}

const BASE_COMMISSION = 22; // Comissão base padrão

export const DebitoReservaCalculator = ({
  open,
  onOpenChange,
  propertyName,
  totalDebtCents,
}: DebitoReservaCalculatorProps) => {
  const [reservationValue, setReservationValue] = useState<string>("");
  const [ownerPercent, setOwnerPercent] = useState<string>("78");

  // Derived calculations
  const reservationCents = Math.round(parseFloat(reservationValue || "0") * 100);
  const ownerPercentNum = parseFloat(ownerPercent || "0");
  const companyPercent = 100 - ownerPercentNum;
  const extraForDebt = Math.max(0, companyPercent - BASE_COMMISSION);
  
  // Calculate amounts
  const ownerValueCents = Math.round((reservationCents * ownerPercentNum) / 100);
  const baseCommissionCents = Math.round((reservationCents * BASE_COMMISSION) / 100);
  const extraCommissionCents = Math.round((reservationCents * extraForDebt) / 100);
  
  // How many reservations needed to cover debt
  const reservationsNeeded = extraCommissionCents > 0 
    ? Math.ceil(totalDebtCents / extraCommissionCents) 
    : Infinity;

  // Calculate suggested owner % to cover debt in one reservation
  const suggestedOwnerPercent = reservationCents > 0
    ? Math.max(0, 100 - BASE_COMMISSION - (totalDebtCents / reservationCents * 100))
    : 0;

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(cents / 100);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Calculadora de Débito em Reserva
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium">{propertyName}</span>
            <br />
            Débito pendente: <span className="text-destructive font-bold">{formatCurrency(totalDebtCents)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reservation-value" className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                Valor da Reserva (R$)
              </Label>
              <Input
                id="reservation-value"
                type="number"
                step="0.01"
                min="0"
                placeholder="Ex: 1500.00"
                value={reservationValue}
                onChange={(e) => setReservationValue(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner-percent" className="flex items-center gap-1">
                <Percent className="h-3 w-3" />
                % do Proprietário
              </Label>
              <Input
                id="owner-percent"
                type="number"
                step="0.1"
                min="0"
                max="100"
                placeholder="Ex: 70"
                value={ownerPercent}
                onChange={(e) => setOwnerPercent(e.target.value)}
              />
            </div>
          </div>

          <Separator />

          {/* Results */}
          <div className="space-y-3">
            <h4 className="font-semibold text-sm text-muted-foreground">Divisão da Comissão</h4>
            
            <div className="grid grid-cols-3 gap-2 text-center">
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">Proprietário</p>
                  <p className="text-lg font-bold text-blue-700">{ownerPercentNum.toFixed(1)}%</p>
                  <p className="text-xs font-medium">{formatCurrency(ownerValueCents)}</p>
                </CardContent>
              </Card>
              
              <Card className="bg-amber-50 border-amber-200">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">Comissão Base</p>
                  <p className="text-lg font-bold text-amber-700">{BASE_COMMISSION}%</p>
                  <p className="text-xs font-medium">{formatCurrency(baseCommissionCents)}</p>
                </CardContent>
              </Card>
              
              <Card className={`${extraForDebt > 0 ? 'bg-green-50 border-green-200' : 'bg-muted border-muted'}`}>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">Extra p/ Débito</p>
                  <p className={`text-lg font-bold ${extraForDebt > 0 ? 'text-green-700' : 'text-muted-foreground'}`}>
                    {extraForDebt.toFixed(1)}%
                  </p>
                  <p className="text-xs font-medium">{formatCurrency(extraCommissionCents)}</p>
                </CardContent>
              </Card>
            </div>

            <Separator />

            {/* Summary */}
            <div className="space-y-2 bg-muted/50 rounded-lg p-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Valor coberto por reserva:</span>
                <span className="font-bold">{formatCurrency(extraCommissionCents)}</span>
              </div>
              
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Reservas necessárias:</span>
                <span className={`font-bold ${reservationsNeeded === Infinity ? 'text-destructive' : 'text-foreground'}`}>
                  {reservationsNeeded === Infinity ? '∞' : reservationsNeeded}
                </span>
              </div>
              
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Total recuperado com {reservationsNeeded !== Infinity ? reservationsNeeded : 0} reserva(s):</span>
                <span className={`font-bold ${(extraCommissionCents * (reservationsNeeded !== Infinity ? reservationsNeeded : 0)) >= totalDebtCents ? 'text-green-600' : 'text-amber-600'}`}>
                  {formatCurrency(extraCommissionCents * (reservationsNeeded !== Infinity ? reservationsNeeded : 0))}
                </span>
              </div>
            </div>

            {/* Suggestion */}
            {reservationCents > 0 && (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowRight className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-sm">Sugestão para quitar em 1 reserva</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Para cobrir o débito de <strong>{formatCurrency(totalDebtCents)}</strong> em uma única reserva de{" "}
                    <strong>{formatCurrency(reservationCents)}</strong>, configure o proprietário para receber{" "}
                    <strong className="text-primary">{Math.max(0, suggestedOwnerPercent).toFixed(1)}%</strong>
                  </p>
                  {suggestedOwnerPercent < 0 && (
                    <p className="text-xs text-destructive mt-1">
                      ⚠️ O valor da reserva não é suficiente para cobrir o débito em uma única vez.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Legend */}
          <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
            <strong>Como funciona:</strong> Comissão base = {BASE_COMMISSION}%. 
            O que exceder {BASE_COMMISSION}% é usado para cobrir o débito do proprietário.
            <br />
            Ex: Se o proprietário recebe 70%, você fica com 30%. Sendo 22% base + 8% para débito.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
