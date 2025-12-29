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
import { Calculator, Percent, DollarSign, ArrowRight, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();
  const [reservationValue, setReservationValue] = useState<string>("");
  const [ownerPercent, setOwnerPercent] = useState<string>("78");

  // Parse value with comma support (Brazilian format)
  const parseValue = (value: string): number => {
    // Replace comma with dot for parsing
    const normalized = value.replace(",", ".");
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Handle input that accepts both comma and dot as decimal separators
  const handleReservationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow only numbers, comma, and dot
    if (/^[0-9]*[,.]?[0-9]*$/.test(value) || value === "") {
      setReservationValue(value);
    }
  };

  const handleOwnerPercentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow only numbers, comma, and dot
    if (/^[0-9]*[,.]?[0-9]*$/.test(value) || value === "") {
      setOwnerPercent(value);
    }
  };

  // Derived calculations
  const reservationCents = Math.round(parseValue(reservationValue) * 100);
  const ownerPercentNum = parseValue(ownerPercent);
  const companyPercent = 100 - ownerPercentNum;
  const extraForDebt = Math.max(0, companyPercent - BASE_COMMISSION);
  
  // Total commission to set in the platform
  const totalCommissionToSet = BASE_COMMISSION + extraForDebt;
  
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
  
  // Suggested total commission to set
  const suggestedTotalCommission = reservationCents > 0
    ? Math.min(100, BASE_COMMISSION + (totalDebtCents / reservationCents * 100))
    : BASE_COMMISSION;

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(cents / 100);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copiado!",
      description: `${label} copiado para a área de transferência.`,
    });
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
                type="text"
                inputMode="decimal"
                placeholder="Ex: 1500,00"
                value={reservationValue}
                onChange={handleReservationChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner-percent" className="flex items-center gap-1">
                <Percent className="h-3 w-3" />
                % do Proprietário
              </Label>
              <Input
                id="owner-percent"
                type="text"
                inputMode="decimal"
                placeholder="Ex: 70"
                value={ownerPercent}
                onChange={handleOwnerPercentChange}
              />
            </div>
          </div>

          <Separator />

          {/* MAIN RESULT - Total Commission to Set */}
          <Card className="bg-gradient-to-r from-primary/20 to-primary/10 border-primary/30">
            <CardContent className="p-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1">Comissão total a configurar na reserva</p>
                <div className="flex items-center justify-center gap-2">
                  <p className="text-4xl font-bold text-primary">{totalCommissionToSet.toFixed(1)}%</p>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => copyToClipboard(totalCommissionToSet.toFixed(1), "Comissão")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  (Base {BASE_COMMISSION}% + Extra {extraForDebt.toFixed(1)}% para débito)
                </p>
              </div>
            </CardContent>
          </Card>

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
                  <div className="space-y-2 text-sm">
                    <p className="text-muted-foreground">
                      Para cobrir <strong>{formatCurrency(totalDebtCents)}</strong> em uma reserva de{" "}
                      <strong>{formatCurrency(reservationCents)}</strong>:
                    </p>
                    <div className="flex items-center gap-3 bg-background rounded-lg p-2">
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">Proprietário recebe:</p>
                        <p className="font-bold text-primary">{Math.max(0, suggestedOwnerPercent).toFixed(1)}%</p>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">Comissão a configurar:</p>
                        <p className="font-bold text-primary">{suggestedTotalCommission.toFixed(1)}%</p>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => copyToClipboard(suggestedTotalCommission.toFixed(1), "Comissão sugerida")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    {suggestedOwnerPercent < 0 && (
                      <p className="text-xs text-destructive">
                        ⚠️ O valor da reserva não é suficiente para cobrir o débito em uma única vez.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Legend */}
          <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
            <strong>Como funciona:</strong> Comissão base = {BASE_COMMISSION}%. 
            O que exceder {BASE_COMMISSION}% é usado para cobrir o débito do proprietário.
            <br />
            Ex: Se o proprietário recebe 70%, configure <strong>30%</strong> de comissão (22% base + 8% débito).
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
