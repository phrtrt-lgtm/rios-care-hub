import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAddPayment } from "@/hooks/useMaintenances";
import { reaisToCents } from "@/lib/format";
import { Upload, X } from "lucide-react";

interface MaintenancePaymentFormProps {
  maintenanceId: string;
  onSuccess?: () => void;
}

export function MaintenancePaymentForm({
  maintenanceId,
  onSuccess,
}: MaintenancePaymentFormProps) {
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<string>("pix");
  const [appliesTo, setAppliesTo] = useState<'total' | 'owner_share' | 'management_share'>('total');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [note, setNote] = useState<string>("");

  const addPayment = useAddPayment();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProofFile(file);
    }
  };

  const handleRemoveFile = () => {
    setProofFile(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const amountValue = parseFloat(amount);
    if (isNaN(amountValue) || amountValue <= 0) {
      alert("Valor inválido");
      return;
    }

    await addPayment.mutateAsync({
      maintenance_id: maintenanceId,
      amount_cents: reaisToCents(amountValue),
      method,
      applies_to: appliesTo,
      proof_file: proofFile,
      note: note || null,
    });

    // Reset form
    setAmount("");
    setProofFile(null);
    setNote("");
    onSuccess?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="amount">Valor (R$) *</Label>
          <Input
            id="amount"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="method">Método de pagamento</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger id="method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pix">PIX</SelectItem>
              <SelectItem value="boleto">Boleto</SelectItem>
              <SelectItem value="cartao">Cartão</SelectItem>
              <SelectItem value="transfer">Transferência</SelectItem>
              <SelectItem value="dinheiro">Dinheiro</SelectItem>
              <SelectItem value="outro">Outro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="appliesTo">Aplica-se a</Label>
          <Select value={appliesTo} onValueChange={(v: any) => setAppliesTo(v)}>
            <SelectTrigger id="appliesTo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="total">Total</SelectItem>
              <SelectItem value="owner_share">Parcela do proprietário</SelectItem>
              <SelectItem value="management_share">Parcela da gestão</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="proofFile">Comprovante</Label>
          <div className="space-y-2">
            {!proofFile ? (
              <div className="relative">
                <Input
                  id="proofFile"
                  type="file"
                  onChange={handleFileChange}
                  accept="image/*,.pdf"
                  className="cursor-pointer"
                />
                <Upload className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
            ) : (
              <div className="flex items-center gap-2 p-2 border rounded-md">
                <span className="flex-1 text-sm truncate">{proofFile.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveFile}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="note">Observação</Label>
        <Textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Informações adicionais sobre o pagamento..."
          rows={2}
        />
      </div>

      <Button type="submit" disabled={addPayment.isPending}>
        {addPayment.isPending ? "Registrando..." : "Registrar pagamento"}
      </Button>
    </form>
  );
}
