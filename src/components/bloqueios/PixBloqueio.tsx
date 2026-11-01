import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CheckCircle2, Copy, Loader2, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatarBRL } from "@/lib/cobrancaMeta";

// As colunas do PIX ainda não estão no types.ts gerado.
const db = supabase as unknown as SupabaseClient;

interface Pedido {
  status: string;
  valor_cents: number | null;
  pix_qr_code: string | null;
  pix_qr_code_base64: string | null;
  pix_expira_em: string | null;
  erro_hostex: string | null;
}

const TERMINAL = new Set(["processed", "pago_pendente_hostex", "expirado", "cancelado", "liberado", "rejected"]);

/**
 * PIX de um pedido de bloqueio (`date_block_requests`) acompanhado ao vivo:
 * QR Code, copia e cola, contagem e o desfecho (datas bloqueadas, equipe
 * conclui, expirou). É o que o cartão da ação `pedir_bloqueio_de_datas` do
 * assistente mostra depois da confirmação (CLAUDE.md §3.21). O dono lê o
 * próprio pedido pela RLS; o webhook do Mercado Pago muda o status.
 */
export function PixBloqueio({ pedidoId }: { pedidoId: string }) {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const terminal = !!pedido && TERMINAL.has(pedido.status);

  useEffect(() => {
    if (terminal) return;
    let ativo = true;
    const consultar = async () => {
      const { data } = await db
        .from("date_block_requests")
        .select("status, valor_cents, pix_qr_code, pix_qr_code_base64, pix_expira_em, erro_hostex")
        .eq("id", pedidoId)
        .maybeSingle();
      if (ativo && data) setPedido(data as Pedido);
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
  }, [pedidoId, terminal]);

  if (!pedido) {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando o PIX…
      </div>
    );
  }

  const segundos = pedido.pix_expira_em ? Math.max(0, Math.floor((new Date(pedido.pix_expira_em).getTime() - agora) / 1000)) : 0;
  const mmss = `${String(Math.floor(segundos / 60)).padStart(2, "0")}:${String(segundos % 60).padStart(2, "0")}`;
  const expirou = pedido.status === "expirado" || (pedido.status === "aguardando_pagamento" && segundos === 0);

  const copiar = async () => {
    if (!pedido.pix_qr_code) return;
    try {
      await navigator.clipboard.writeText(pedido.pix_qr_code);
      toast.success("Código PIX copiado.");
    } catch {
      toast.error("Não consegui copiar. Selecione o código e copie.");
    }
  };

  if (pedido.status === "processed") {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-success">
        <CheckCircle2 className="h-3.5 w-3.5" /> Pagamento confirmado e datas bloqueadas no Airbnb e no Booking.
      </p>
    );
  }
  if (pedido.status === "pago_pendente_hostex") {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-warning">
        <QrCode className="h-3.5 w-3.5" /> Pagamento confirmado. A equipe RIOS conclui o bloqueio no calendário em instantes.
      </p>
    );
  }
  if (pedido.status === "cancelado" || pedido.status === "liberado") {
    return <p className="mt-2 text-xs text-muted-foreground">Este pedido foi {pedido.status === "cancelado" ? "cancelado" : "liberado"}.</p>;
  }
  if (expirou) {
    return <p className="mt-2 text-xs text-muted-foreground">O PIX expirou sem pagamento. Peça o bloqueio de novo para gerar outro.</p>;
  }

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Taxa de limpeza</span>
        <span className="font-semibold tabular-nums text-foreground">{typeof pedido.valor_cents === "number" ? formatarBRL(pedido.valor_cents) : "—"}</span>
      </div>
      {pedido.pix_qr_code_base64 && (
        // Fundo branco atrás do QR: única cor crua, para o leitor conseguir ler o código.
        <div className="flex justify-center rounded-lg border bg-white p-2">
          <img src={`data:image/png;base64,${pedido.pix_qr_code_base64}`} alt="QR Code do PIX" className="h-40 w-40" />
        </div>
      )}
      {pedido.pix_qr_code && (
        <Button variant="outline" size="sm" className="w-full" onClick={copiar}>
          <Copy className="mr-1 h-3.5 w-3.5" />
          Copiar código PIX (copia e cola)
        </Button>
      )}
      <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Aguardando o pagamento · expira em {mmss}. Pago, as datas são bloqueadas na hora.
      </p>
    </div>
  );
}
