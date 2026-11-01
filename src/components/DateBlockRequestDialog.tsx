import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { differenceInCalendarDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, CheckCircle2, Copy, Loader2, QrCode } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { descreverErroDaFunction } from "@/lib/erroFunction";
import { formatarBRL } from "@/lib/cobrancaMeta";
import { MeusBloqueios } from "@/components/bloqueios/MeusBloqueios";

interface DateBlockRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  propertyName: string;
}

type Step = "dates" | "pagamento" | "success";

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
 * Bloqueio de datas pelo proprietário (PLANO_IA_AGENTE.md §4, CLAUDE.md §3.21).
 * Só uso pessoal, desde 2026-11-01 (pedido do gestor): gera um PIX no valor da
 * taxa de limpeza do imóvel; pago, o webhook cria na Hostex uma reserva direta
 * em nome de "Proprietário" (a equipe de limpeza vê no app) e este diálogo
 * acompanha até confirmar. O motivo "Manutenção" saiu: obra é com a RIOS, pelo
 * chamado, e a equipe bloqueia (reserva "MANUTENÇÃO · tipo").
 */
export const DateBlockRequestDialog = ({ open, onOpenChange, propertyId, propertyName }: DateBlockRequestDialogProps) => {
  const [step, setStep] = useState<Step>("dates");
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
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
    if (validarDatas()) void gerarPix();
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
            Bloqueio de datas
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
            <div className="space-y-1.5">
              <Label className="text-xs">Observações (opcional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Quem vai usar, horário de chegada…" className="h-16 resize-none text-sm" />
            </div>
            <p className="rounded-lg border border-info/30 bg-info/10 p-3 text-xs text-info">
              Uso pessoal: você paga a taxa de limpeza por PIX e as datas ficam fechadas na hora, como uma reserva em seu nome. Precisa de obra ou reparo? Abra um chamado: a RIOS bloqueia sem custo.
            </p>
            <Button onClick={handleNext} className="w-full" size="sm" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gerar PIX da taxa de limpeza"}
            </Button>
            {/* Bloqueios futuros deste imóvel, com "Liberar datas" / "Cancelar pedido" (liberar-bloqueio). */}
            <MeusBloqueios propertyId={propertyId} />
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
                  Assim que o Mercado Pago confirmar, a Hostex ganha uma reserva em seu nome e esta tela avisa.
                </p>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={handleClose} className="w-full">
              Fechar e pagar depois
            </Button>
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
                    {startDate && format(startDate, "dd/MM")} a {endDate && format(endDate, "dd/MM")} ficaram fechadas no Airbnb e no Booking, como reserva em seu nome. Bom descanso!
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
