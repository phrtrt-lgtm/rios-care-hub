import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Clock, CheckCircle2, Wrench, Users, Upload, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface DateBlockRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  propertyName: string;
}

type Step = "dates" | "reason" | "proof" | "confirm" | "success";

export const DateBlockRequestDialog = ({
  open,
  onOpenChange,
  propertyId,
  propertyName,
}: DateBlockRequestDialogProps) => {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("dates");
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [reason, setReason] = useState<"maintenance" | "family_visit">("maintenance");
  const [notes, setNotes] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setStep("dates");
    setStartDate(undefined);
    setEndDate(undefined);
    setReason("maintenance");
    setNotes("");
    setProofFile(null);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const handleNext = () => {
    if (step === "dates") {
      if (!startDate || !endDate) {
        toast({ title: "Selecione as datas", variant: "destructive" });
        return;
      }
      if (endDate < startDate) {
        toast({ title: "A data de saída deve ser após a data de entrada", variant: "destructive" });
        return;
      }
      setStep("reason");
    } else if (step === "reason") {
      if (reason === "family_visit") {
        setStep("proof");
      } else {
        setStep("confirm");
      }
    } else if (step === "proof") {
      if (!proofFile) {
        toast({ title: "Anexe o comprovante da taxa de limpeza", variant: "destructive" });
        return;
      }
      setStep("confirm");
    }
  };

  const handleSubmit = async () => {
    if (!user || !startDate || !endDate) return;
    setSubmitting(true);

    try {
      let proofPath: string | null = null;

      if (proofFile) {
        setUploading(true);
        const fileName = `block-proofs/${user.id}/${Date.now()}-${proofFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("attachments")
          .upload(fileName, proofFile);

        if (uploadError) throw uploadError;
        proofPath = fileName;
        setUploading(false);
      }

      const { error } = await supabase.from("date_block_requests").insert({
        property_id: propertyId,
        owner_id: user.id,
        start_date: format(startDate, "yyyy-MM-dd"),
        end_date: format(endDate, "yyyy-MM-dd"),
        reason,
        notes: notes || null,
        cleaning_fee_proof_path: proofPath,
        status: "pending",
      });

      if (error) throw error;

      setStep("success");
    } catch (err) {
      console.error(err);
      toast({ title: "Erro ao enviar solicitação", variant: "destructive" });
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  const reasonLabel = reason === "maintenance" ? "Manutenção" : "Visita de familiar";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarIcon className="h-4 w-4 text-primary" />
            Solicitar Bloqueio de Datas
          </DialogTitle>
          <p className="text-xs text-muted-foreground font-normal">{propertyName}</p>
        </DialogHeader>

        {/* Step: Dates */}
        {step === "dates" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Selecione o período que deseja bloquear:</p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Data de entrada</Label>
                <Popover open={startOpen} onOpenChange={setStartOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn("w-full justify-start text-left text-xs", !startDate && "text-muted-foreground")}
                    >
                      <CalendarIcon className="h-3 w-3 mr-1" />
                      {startDate ? format(startDate, "dd/MM/yyyy") : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={(d) => { setStartDate(d); setStartOpen(false); }}
                      disabled={(d) => d < new Date()}
                      initialFocus
                      locale={ptBR}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Data de saída</Label>
                <Popover open={endOpen} onOpenChange={setEndOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn("w-full justify-start text-left text-xs", !endDate && "text-muted-foreground")}
                    >
                      <CalendarIcon className="h-3 w-3 mr-1" />
                      {endDate ? format(endDate, "dd/MM/yyyy") : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={(d) => { setEndDate(d); setEndOpen(false); }}
                      disabled={(d) => d < (startDate || new Date())}
                      initialFocus
                      locale={ptBR}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <Button onClick={handleNext} className="w-full" size="sm">
              Continuar
            </Button>
          </div>
        )}

        {/* Step: Reason */}
        {step === "reason" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Qual é o motivo do bloqueio?</p>

            <RadioGroup value={reason} onValueChange={(v) => setReason(v as "maintenance" | "family_visit")} className="space-y-2">
              <label className={cn(
                "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                reason === "maintenance" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
              )}>
                <RadioGroupItem value="maintenance" className="mt-0.5" />
                <div>
                  <div className="flex items-center gap-1.5 font-medium text-sm">
                    <Wrench className="h-3.5 w-3.5 text-orange-500" />
                    Manutenção
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Reparos, obras ou serviços na unidade</p>
                </div>
              </label>

              <label className={cn(
                "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                reason === "family_visit" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
              )}>
                <RadioGroupItem value="family_visit" className="mt-0.5" />
                <div>
                  <div className="flex items-center gap-1.5 font-medium text-sm">
                    <Users className="h-3.5 w-3.5 text-blue-500" />
                    Visita de familiar
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Uso pessoal — requer comprovante da taxa de limpeza</p>
                </div>
              </label>
            </RadioGroup>

            <div className="space-y-1.5">
              <Label className="text-xs">Observações (opcional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Detalhes adicionais..."
                className="text-sm resize-none h-20"
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep("dates")} className="flex-1">Voltar</Button>
              <Button size="sm" onClick={handleNext} className="flex-1">Continuar</Button>
            </div>
          </div>
        )}

        {/* Step: Proof of cleaning fee (only for family visits) */}
        {step === "proof" && reason === "family_visit" && (
          <div className="space-y-4">
            <div className="rounded-lg bg-warning/10 border border-warning/30 p-3 text-xs text-warning-foreground" style={{background:'hsl(38 92% 50% / 0.1)', borderColor:'hsl(38 92% 50% / 0.3)', color:'hsl(25 95% 25%)'}}>
              <strong>Taxa de limpeza obrigatória</strong>
              <p className="mt-0.5">Para visitas de familiares, é necessário anexar o comprovante de pagamento da taxa de limpeza.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Comprovante da taxa de limpeza</Label>
              {proofFile ? (
                <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                  <span className="text-xs text-foreground truncate">{proofFile.name}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setProofFile(null)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-6 cursor-pointer hover:bg-muted/50 transition-colors">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground text-center">Clique para anexar<br />PDF, imagem ou comprovante</span>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*,.pdf"
                    onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep("reason")} className="flex-1">Voltar</Button>
              <Button size="sm" onClick={handleNext} className="flex-1">Continuar</Button>
            </div>
          </div>
        )}

        {/* Step: Confirm */}
        {step === "confirm" && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unidade</span>
                <span className="font-medium text-right max-w-[55%] truncate">{propertyName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Entrada</span>
                <span className="font-medium">{startDate ? format(startDate, "dd/MM/yyyy") : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Saída</span>
                <span className="font-medium">{endDate ? format(endDate, "dd/MM/yyyy") : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Motivo</span>
                <span className="font-medium">{reasonLabel}</span>
              </div>
              {notes && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Obs.</span>
                  <span className="font-medium text-right max-w-[55%]">{notes}</span>
                </div>
              )}
              {proofFile && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Comprovante</span>
                  <span className="font-medium text-green-600">Anexado ✓</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
              <Clock className="h-4 w-4 shrink-0" />
              <span>As datas serão bloqueadas em até <strong>1h 30min</strong> após a confirmação.</span>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep(reason === "family_visit" ? "proof" : "reason")} className="flex-1">
                Voltar
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={submitting} className="flex-1">
                {submitting ? (uploading ? "Enviando arquivo..." : "Enviando...") : "Confirmar Solicitação"}
              </Button>
            </div>
          </div>
        )}

        {/* Step: Success */}
        {step === "success" && (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div className="rounded-full bg-green-100 p-4">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Solicitação enviada!</p>
              <p className="text-sm text-muted-foreground mt-1">
                As datas serão bloqueadas em até <strong>1h 30min</strong> pela nossa equipe.
              </p>
            </div>
            <Button onClick={handleClose} className="w-full" size="sm">
              Fechar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
