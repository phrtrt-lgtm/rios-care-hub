import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
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
import { differenceInCalendarDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, CheckCircle2, Clock, Copy, Loader2, QrCode, Users, Wrench } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { descreverErroDaFunction } from "@/lib/erroFunction";
import { formatarBRL } from "@/lib/cobrancaMeta";

interface DateBlockRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  propertyName: string;
}

type Step = "dates" | "reason" | "pagamento" | "confirm" | "success";
type Motivo = "maintenance" | "family_visit";

interface PedidoPix {
  id: string;
  imovel: string;
  noites: number;
  valor_cents: number;
  pix_qr_code: string | null;
  pix_qr_code_base64: string | null;
  pix_expira_em: string;
}

type StatusPedido = "aguardando_pagamento" | "pago_pendente_hostex" | "processed" | "expirado" | "pending" | "rejected";

// As colunas novas do pedido ainda não estão no types.ts gerado.
const db = supabase as unknown as SupabaseClient;

/**
 * Pedido de bloqueio de datas pelo proprietário (PLANO_IA_AGENTE.md §4).
 * Manutenção: vai para a fila da equipe, como sempre. Uso pessoal: gera um
 * PIX no valor da taxa de limpeza do imóvel; pago, o webhook bloqueia as
 * noites na Hostex e este diálogo acompanha até confirmar.
 */
export const DateBlockRequestDialog = ({ open, onOpenChange, propertyId, propertyName }: DateBlockRequestDialogProps) => {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("dates");
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [reason, setReason] = useState<Motivo>("maintenance");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pedido, setPedido] = useState<PedidoPix | null>(null);
  const [statusPedido, setStatusPedido] = useState<StatusPedido>("aguardando_pagamento");
  const [erroHostex, setErroHostex] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => Date.now());

  const noites = startDate && endDate ? differenceInCalendarDays(endDate, startDate) : 0;

  const reset = () => {
    setStep("dates");
    setStartDate(undefined);
    setEndDate(undefined);
    setReason("maintenance");
    setNotes("");
    setPedido(null);
    setStatusPedido("aguardando_pagamento");
    setErroHostex(null);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  // Acompanha o pedido enquanto o PIX está na tela: o webhook muda o status
  // quando o Mercado Pago confirma e a Hostex bloqueia.
  useEffect(() => {
    if (step !== "pagamento" || !pedido) return;
    let ativo = true;
    const consultar = async () => {
      const { data } = await db.from("date_block_requests").select("status, erro_hostex").eq("id", pedido.id).maybeSingle();
      if (!ativo || !data) return;
      setStatusPedido(data.status as StatusPedido);
      setErroHostex((data.erro_hostex as string | null) ?? null);
      if (data.status === "processed" || data.status === "pago_pendente_hostex") setStep("success");
    };
    void consultar();
    const timer = setInterval(() => {
      setAgora(Date.now());
      void consultar();
    }, 4000);
    return () => {
      ativo = false;
      clearInterval(timer);
    };
  }, [step, pedido]);

  const validarDatas = (): boolean => {
    if (!startDate || !endDate) {
      toast({ title: "Selecione as datas", variant: "destructive" });
      return false;
    }
    if (noites < 1) {
      toast({ title: "A saída precisa ser depois da entrada", variant: "destructive" });
      return false;
    }
    if (noites > 30) {
      toast({ title: "No máximo 30 noites por pedido", variant: "destructive" });
      return false;
    }
    return true;
  };

  const gerarPix = async () => {
    if (!startDate || !endDate) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke<PedidoPix>("create-bloqueio-pix", {
        body: {
          property_id: propertyId,
          start_date: format(startDate, "yyyy-MM-dd"),
          end_date: format(endDate, "yyyy-MM-dd"),
          notes: notes || null,
        },
      });
      if (error) throw error;
      if (!data?.id) throw new Error("Não consegui gerar o PIX.");
      setPedido(data);
      setStatusPedido("aguardando_pagamento");
      setErroHostex(null);
      setAgora(Date.now());
      setStep("pagamento");
    } catch (err) {
      toast({ title: await descreverErroDaFunction(err, "Não consegui gerar o PIX. Tente de novo."), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    if (step === "dates") {
      if (validarDatas()) setStep("reason");
    } else if (step === "reason") {
      if (reason === "family_visit") void gerarPix();
      else setStep("confirm");
    }
  };

  // Manutenção: pedido para a equipe avaliar, como antes (sem pagamento).
  const handleSubmitManutencao = async () => {
    if (!user || !startDate || !endDate) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("date_block_requests").insert({
        property_id: propertyId,
        owner_id: user.id,
        start_date: format(startDate, "yyyy-MM-dd"),
        end_date: format(endDate, "yyyy-MM-dd"),
        reason: "maintenance",
        notes: notes || null,
        status: "pending",
      });
      if (error) throw error;
      setStatusPedido("pending");
      setStep("success");
    } catch (err) {
      console.error(err);
      toast({ title: "Erro ao enviar solicitação", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const copiarPix = async () => {
    if (!pedido?.pix_qr_code) return;
    try {
      await navigator.clipboard.writeText(pedido.pix_qr_code);
      toast({ title: "Código PIX copiado" });
    } catch {
      toast({ title: "Não consegui copiar. Selecione o código e copie.", variant: "destructive" });
    }
  };

  const segundosRestantes = pedido ? Math.max(0, Math.floor((new Date(pedido.pix_expira_em).getTime() - agora) / 1000)) : 0;
  const expirou = statusPedido === "expirado" || (step === "pagamento" && segundosRestantes === 0);
  const mmss = `${String(Math.floor(segundosRestantes / 60)).padStart(2, "0")}:${String(segundosRestantes % 60).padStart(2, "0")}`;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarIcon className="h-4 w-4 text-primary" />
            Bloquear datas
          </DialogTitle>
          <p className="text-xs font-normal text-muted-foreground">{propertyName}</p>
        </DialogHeader>

        {step === "dates" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Selecione o período que deseja bloquear:</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Entrada</Label>
                <Popover open={startOpen} onOpenChange={setStartOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("w-full justify-start text-left text-xs", !startDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-1 h-3 w-3" />
                      {startDate ? format(startDate, "dd/MM/yyyy") : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={(d) => {
                        setStartDate(d);
                        setStartOpen(false);
                      }}
                      disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                      locale={ptBR}
                      className="pointer-events-auto p-3"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Saída</Label>
                <Popover open={endOpen} onOpenChange={setEndOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("w-full justify-start text-left text-xs", !endDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-1 h-3 w-3" />
                      {endDate ? format(endDate, "dd/MM/yyyy") : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={(d) => {
                        setEndDate(d);
                        setEndOpen(false);
                      }}
                      disabled={(d) => d <= (startDate || new Date())}
                      initialFocus
                      locale={ptBR}
                      className="pointer-events-auto p-3"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            {noites > 0 && (
              <p className="text-xs text-muted-foreground">
                {noites} {noites === 1 ? "noite" : "noites"}, saída na manhã de {endDate && format(endDate, "dd/MM")}.
              </p>
            )}
            <Button onClick={handleNext} className="w-full" size="sm">
              Continuar
            </Button>
          </div>
        )}

        {step === "reason" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Qual é o motivo do bloqueio?</p>
            <RadioGroup value={reason} onValueChange={(v) => setReason(v as Motivo)} className="space-y-2">
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                  reason === "maintenance" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
                )}
              >
                <RadioGroupItem value="maintenance" className="mt-0.5" />
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Wrench className="h-3.5 w-3.5 text-warning" />
                    Manutenção
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">Reparos, obras ou serviços na unidade. A equipe avalia e bloqueia.</p>
                </div>
              </label>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                  reason === "family_visit" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
                )}
              >
                <RadioGroupItem value="family_visit" className="mt-0.5" />
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Users className="h-3.5 w-3.5 text-info" />
                    Uso pessoal
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Você ou familiares na unidade. Paga a taxa de limpeza por PIX e as datas são bloqueadas na hora.
                  </p>
                </div>
              </label>
            </RadioGroup>
            <div className="space-y-1.5">
              <Label className="text-xs">Observações (opcional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Detalhes adicionais…" className="h-20 resize-none text-sm" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep("dates")} className="flex-1" disabled={submitting}>
                Voltar
              </Button>
              <Button size="sm" onClick={handleNext} className="flex-1" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : reason === "family_visit" ? "Gerar PIX" : "Continuar"}
              </Button>
            </div>
          </div>
        )}

        {step === "pagamento" && pedido && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Período</span>
                <span className="font-medium">
                  {startDate && format(startDate, "dd/MM")} a {endDate && format(endDate, "dd/MM")} · {pedido.noites} {pedido.noites === 1 ? "noite" : "noites"}
                </span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">Taxa de limpeza</span>
                <span className="font-semibold tabular-nums">{formatarBRL(pedido.valor_cents)}</span>
              </div>
            </div>

            {expirou ? (
              <div className="space-y-3 text-center">
                <p className="text-sm text-muted-foreground">O PIX expirou sem pagamento. Gere outro para continuar.</p>
                <Button size="sm" onClick={gerarPix} disabled={submitting} className="w-full">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gerar novo PIX"}
                </Button>
              </div>
            ) : (
              <>
                {pedido.pix_qr_code_base64 && (
                  // Fundo branco atrás do QR: única cor crua, para o leitor conseguir ler o código.
                  <div className="flex justify-center rounded-lg border bg-white p-3">
                    <img src={pedido.pix_qr_code_base64} alt="QR Code do PIX" className="h-44 w-44" />
                  </div>
                )}
                {pedido.pix_qr_code && (
                  <Button variant="outline" size="sm" className="w-full" onClick={copiarPix}>
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    Copiar código PIX (copia e cola)
                  </Button>
                )}
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Aguardando o pagamento · expira em {mmss}
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  Assim que o Mercado Pago confirmar, as datas são bloqueadas na Hostex e esta tela avisa.
                </p>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={handleClose} className="w-full">
              Fechar e pagar depois
            </Button>
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-4">
            <div className="space-y-2.5 rounded-lg border bg-muted/30 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unidade</span>
                <span className="max-w-[55%] truncate text-right font-medium">{propertyName}</span>
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
                <span className="font-medium">Manutenção</span>
              </div>
              {notes && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Obs.</span>
                  <span className="max-w-[55%] text-right font-medium">{notes}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-info/30 bg-info/10 p-3 text-xs text-info">
              <Clock className="h-4 w-4 shrink-0" />
              <span>A equipe RIOS avalia o pedido e bloqueia as datas.</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep("reason")} className="flex-1">
                Voltar
              </Button>
              <Button size="sm" onClick={handleSubmitManutencao} disabled={submitting} className="flex-1">
                {submitting ? "Enviando…" : "Confirmar pedido"}
              </Button>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div className={cn("rounded-full p-4", statusPedido === "pago_pendente_hostex" ? "bg-warning/10" : "bg-success/10")}>
              {statusPedido === "pago_pendente_hostex" ? <QrCode className="h-10 w-10 text-warning" /> : <CheckCircle2 className="h-10 w-10 text-success" />}
            </div>
            <div>
              {statusPedido === "processed" && (
                <>
                  <p className="font-semibold text-foreground">Pagamento confirmado e datas bloqueadas</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {startDate && format(startDate, "dd/MM")} a {endDate && format(endDate, "dd/MM")} ficaram fechadas no Airbnb e no Booking. Bom descanso!
                  </p>
                </>
              )}
              {statusPedido === "pago_pendente_hostex" && (
                <>
                  <p className="font-semibold text-foreground">Pagamento confirmado</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A equipe RIOS conclui o bloqueio no calendário em instantes{erroHostex ? "." : "."}
                  </p>
                </>
              )}
              {statusPedido === "pending" && (
                <>
                  <p className="font-semibold text-foreground">Pedido enviado</p>
                  <p className="mt-1 text-sm text-muted-foreground">A equipe RIOS avalia e bloqueia as datas em até <strong>1h 30min</strong>.</p>
                </>
              )}
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
