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
import { Calculator, DollarSign, Copy, Check } from "lucide-react";
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
  const [ownerValue, setOwnerValue] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Parse value with comma support (Brazilian format)
  const parseValue = (value: string): number => {
    const normalized = value.replace(",", ".");
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Handle input that accepts both comma and dot as decimal separators
  const handleOwnerValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow only numbers, comma, and dot
    if (/^[0-9]*[,.]?[0-9]*$/.test(value) || value === "") {
      setOwnerValue(value);
    }
  };

  const ownerValueNum = parseValue(ownerValue);
  const totalDebt = totalDebtCents / 100;

  // Se o proprietário recebe X reais, e temos uma dívida de Y,
  // precisamos descontar Y do valor X do proprietário
  // Isso significa que precisamos adicionar (Y/X)*100% à nossa comissão base
  const extraPercentNeeded = ownerValueNum > 0 
    ? (totalDebt / ownerValueNum) * 100 
    : 0;

  // Total de comissão a configurar na reserva (base + extra)
  const totalCommissionToSet = BASE_COMMISSION + extraPercentNeeded;

  // Valor que será descontado do proprietário
  const debtCoverage = ownerValueNum > 0 
    ? Math.min(totalDebt, (extraPercentNeeded / 100) * ownerValueNum) 
    : 0;

  // Quanto ficará para o proprietário depois do desconto
  const ownerReceivesAfter = ownerValueNum - debtCoverage;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(totalCommissionToSet.toFixed(2).replace(".", ","));
      setCopied(true);
      toast({
        title: "Copiado!",
        description: "Comissão copiada para a área de transferência",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Erro ao copiar",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
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
          {/* Dívida total */}
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="pt-4 pb-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Dívida Total a Cobrir</p>
                <p className="text-2xl font-bold text-destructive">
                  {formatCurrency(totalDebt)}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Input do valor do proprietário */}
          <div className="space-y-2">
            <Label htmlFor="owner-value" className="flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              Valor do Proprietário na reserva (R$)
            </Label>
            <Input
              id="owner-value"
              type="text"
              inputMode="decimal"
              placeholder="Ex: 780,00"
              value={ownerValue}
              onChange={handleOwnerValueChange}
              className="text-lg"
            />
            <p className="text-xs text-muted-foreground">
              Digite o valor que aparece para o proprietário no seu sistema
            </p>
          </div>

          {ownerValueNum > 0 && (
            <>
              <Separator />

              {/* RESULTADO PRINCIPAL - Comissão total a configurar */}
              <Card className="bg-gradient-to-r from-primary/20 to-primary/10 border-primary/30">
                <CardContent className="p-4">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-1">Comissão a configurar na reserva</p>
                    <div className="flex items-center justify-center gap-2">
                      <p className="text-4xl font-bold text-primary">
                        {totalCommissionToSet.toFixed(2).replace(".", ",")}%
                      </p>
                      <Button 
                        variant="outline" 
                        size="icon"
                        className="h-10 w-10"
                        onClick={handleCopy}
                      >
                        {copied ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Base {BASE_COMMISSION}% + {extraPercentNeeded.toFixed(2).replace(".", ",")}% extra para débito
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Breakdown */}
              <div className="grid grid-cols-2 gap-3">
                <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Comissão Base</p>
                    <p className="text-xl font-bold text-amber-700 dark:text-amber-400">{BASE_COMMISSION}%</p>
                  </CardContent>
                </Card>
                <Card className="bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800">
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Extra p/ Débito</p>
                    <p className="text-xl font-bold text-orange-600 dark:text-orange-400">
                      +{extraPercentNeeded.toFixed(2).replace(".", ",")}%
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Resumo */}
              <Card className="bg-muted/50">
                <CardContent className="p-3 space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Valor original do proprietário:</span>
                    <span className="font-medium">{formatCurrency(ownerValueNum)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Desconto para dívida:</span>
                    <span className="font-medium text-destructive">- {formatCurrency(debtCoverage)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Proprietário receberá:</span>
                    <span className="font-bold">{formatCurrency(ownerReceivesAfter)}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Status */}
              {debtCoverage >= totalDebt ? (
                <div className="text-center text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded-lg p-2">
                  ✓ Cobre toda a dívida nesta reserva
                </div>
              ) : (
                <div className="text-center text-sm text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 rounded-lg p-2">
                  ⚠️ Restará {formatCurrency(totalDebt - debtCoverage)} de dívida
                </div>
              )}
            </>
          )}

          {/* Legenda */}
          <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
            <strong>Como funciona:</strong> Sua comissão base é {BASE_COMMISSION}%. 
            O extra ({extraPercentNeeded > 0 ? extraPercentNeeded.toFixed(2).replace(".", ",") : "0"}%) 
            é calculado em cima do valor do proprietário para cobrir a dívida.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
