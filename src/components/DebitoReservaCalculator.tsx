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
import { Calculator, DollarSign, Copy, Check, Send, CalendarIcon, Loader2 } from "lucide-react";
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

const DEFAULT_BASE_COMMISSION = "22"; // Comissão base padrão

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
  const [ownerValue, setOwnerValue] = useState<string>("");
  const [baseCommission, setBaseCommission] = useState<string>(DEFAULT_BASE_COMMISSION);
  const [copied, setCopied] = useState(false);
  const [reserveDate, setReserveDate] = useState<Date | undefined>();
  const [isConfirming, setIsConfirming] = useState(false);

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

  // Handle base commission input
  const handleBaseCommissionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^[0-9]*[,.]?[0-9]*$/.test(value) || value === "") {
      setBaseCommission(value);
    }
  };

  const ownerValueNum = parseValue(ownerValue);
  const baseCommissionNum = parseValue(baseCommission);
  const totalDebt = totalDebtCents / 100;

  // O "valor do proprietário" no Airbnb é o valor LÍQUIDO (já descontada a comissão base).
  // Para calcular o extra, precisamos reverter para o valor BRUTO da reserva:
  // valorBruto = ownerValue / (1 - baseCommission/100)
  const grossReservationValue = ownerValueNum > 0 && baseCommissionNum < 100
    ? ownerValueNum / (1 - baseCommissionNum / 100)
    : 0;

  // Extra % necessário = dívida / valorBruto * 100
  const extraPercentNeededExact = grossReservationValue > 0
    ? (totalDebt / grossReservationValue) * 100
    : 0;

  // Arredondar para cima (garantir que cubra a dívida)
  const extraPercentRounded = Math.ceil(extraPercentNeededExact);

  // Total de comissão a configurar na reserva (base + extra arredondado)
  const totalCommissionToSet = baseCommissionNum + extraPercentRounded;

  // Valor efetivamente descontado do proprietário com % arredondado
  const debtCoverage = grossReservationValue > 0
    ? Math.min(totalDebt, (extraPercentRounded / 100) * grossReservationValue)
    : 0;

  // Valor extra devido ao arredondamento para cima
  const extraFromRounding = grossReservationValue > 0
    ? ((extraPercentRounded - extraPercentNeededExact) / 100) * grossReservationValue
    : 0;

  // Quanto ficará para o proprietário depois do desconto
  const ownerReceivesAfter = ownerValueNum - Math.min(totalDebt, debtCoverage);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(totalCommissionToSet.toFixed(0));
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

  const handleConfirmDebit = async () => {
    // Support both single chargeId and array of chargeIds
    const idsToProcess = chargeIds || (chargeId ? [chargeId] : []);
    
    if (idsToProcess.length === 0) {
      toast({
        title: "Erro",
        description: "ID da cobrança não encontrado",
        variant: "destructive",
      });
      return;
    }

    if (ownerValueNum <= 0 || baseCommissionNum <= 0) {
      toast({
        title: "Erro",
        description: "Preencha os valores corretamente",
        variant: "destructive",
      });
      return;
    }

    setIsConfirming(true);

    try {
      const { data, error } = await supabase.functions.invoke('debit-reserve', {
        body: {
          chargeIds: idsToProcess,
          reserveDate: reserveDate ? format(reserveDate, 'yyyy-MM-dd') : null,
          ownerValueCents: Math.round(ownerValueNum * 100),
          baseCommissionPercent: baseCommissionNum,
          extraCommissionPercent: extraPercentRounded,
          extraCommissionPercentExact: extraPercentNeededExact,
          totalCommissionPercent: totalCommissionToSet,
          ownerReceivesCents: Math.round(ownerReceivesAfter * 100),
        },
      });

      if (error) throw error;

      const chargeCount = idsToProcess.length;
      toast({
        title: "Débito confirmado!",
        description: `${chargeCount} cobrança${chargeCount > 1 ? 's processadas' : ' processada'}. Proprietário notificado.`,
      });

      onDebitConfirmed?.();
      onOpenChange(false);

      // Reset form
      setOwnerValue("");
      setReserveDate(undefined);
    } catch (error: any) {
      console.error('Error confirming debit:', error);
      toast({
        title: "Erro ao confirmar débito",
        description: error.message || "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setIsConfirming(false);
    }
  };

  const hasCharges = (chargeIds && chargeIds.length > 0) || chargeId;
  const canConfirm = hasCharges && ownerValueNum > 0 && baseCommissionNum > 0 && reserveDate;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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

          {/* Input da comissão base */}
          <div className="space-y-2">
            <Label htmlFor="base-commission">Comissão Base (%)</Label>
            <Input
              id="base-commission"
              type="text"
              inputMode="decimal"
              placeholder="22"
              value={baseCommission}
              onChange={handleBaseCommissionChange}
              className="text-lg"
            />
            <p className="text-xs text-muted-foreground">
              Sua comissão padrão (ex: 22%)
            </p>
          </div>

          {/* Data do check-in (obrigatória para lembrete) */}
          {hasCharges && (
            <div className="space-y-2">
              <Label>Data do Check-in do Hóspede *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !reserveDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {reserveDate ? format(reserveDate, "PPP", { locale: ptBR }) : "Selecionar data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={reserveDate}
                    onSelect={setReserveDate}
                    locale={ptBR}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                Você receberá um lembrete 1 dia antes para alterar a comissão
              </p>
            </div>
          )}

          {ownerValueNum > 0 && baseCommissionNum > 0 && (
            <>
              <Separator />

              {/* RESULTADO PRINCIPAL - Comissão total a configurar */}
              <Card className="bg-gradient-to-r from-primary/20 to-primary/10 border-primary/30">
                <CardContent className="p-4">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-1">Comissão a configurar na reserva</p>
                    <div className="flex items-center justify-center gap-2">
                      <p className="text-4xl font-bold text-primary">
                        {totalCommissionToSet.toFixed(0)}%
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
                      Base {baseCommissionNum.toFixed(0)}% + {extraPercentRounded}% extra (exato: {extraPercentNeededExact.toFixed(2).replace(".", ",")}%)
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Breakdown */}
              <div className="grid grid-cols-2 gap-3">
                <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Comissão Base</p>
                    <p className="text-xl font-bold text-amber-700 dark:text-amber-400">{baseCommissionNum.toFixed(0)}%</p>
                  </CardContent>
                </Card>
                <Card className="bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800">
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Extra p/ Débito</p>
                    <p className="text-xl font-bold text-orange-600 dark:text-orange-400">
                      +{extraPercentRounded}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      (exato: {extraPercentNeededExact.toFixed(2).replace(".", ",")}%)</p>
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
                    <span className="font-medium text-destructive">- {formatCurrency(totalDebt)}</span>
                  </div>
                  {extraFromRounding > 0.01 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Extra (arredondamento):</span>
                      <span className="font-medium text-amber-600">- {formatCurrency(extraFromRounding)}</span>
                    </div>
                  )}
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

              {/* Botão de confirmar débito */}
              {hasCharges && (
                <Button 
                  onClick={handleConfirmDebit}
                  disabled={!canConfirm || isConfirming}
                  className="w-full"
                  size="lg"
                >
                  {isConfirming ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Confirmar Débito e Notificar Proprietário
                      {chargeIds && chargeIds.length > 1 && ` (${chargeIds.length} cobranças)`}
                    </>
                  )}
                </Button>
              )}
            </>
          )}

          {/* Legenda */}
          <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
            <strong>Como funciona:</strong> O valor do proprietário no Airbnb já é líquido (após comissão base de {baseCommissionNum.toFixed(0)}%).
            O sistema calcula o valor bruto da reserva e aplica o percentual extra sobre ele.
            O arredondamento é sempre para cima para garantir cobertura da dívida.
            {hasCharges && (
              <span className="block mt-1">
                <strong>Ao confirmar:</strong> O proprietário receberá email e notificação com todos os detalhes do cálculo.
              </span>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
