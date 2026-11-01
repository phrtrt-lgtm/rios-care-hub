import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays, format } from "date-fns";
import { CalendarX, Loader2, Users, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { descreverErroDaFunction } from "@/lib/erroFunction";
import { formatarBRL } from "@/lib/cobrancaMeta";

/** Coluna DATE lida como dia local (new Date("aaaa-mm-dd") leria meia-noite UTC e voltaria um dia). */
const lerDiaLocal = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(a, m - 1, d);
};

// As colunas novas do pedido ainda não estão no types.ts gerado.
const db = supabase as unknown as SupabaseClient;

interface Bloqueio {
  id: string;
  start_date: string;
  end_date: string;
  reason: "maintenance" | "family_visit";
  status: "pending" | "aguardando_pagamento" | "pago_pendente_hostex" | "processed";
  valor_cents: number | null;
  pago_em: string | null;
}

const STATUS: Record<Bloqueio["status"], string> = {
  pending: "Equipe avalia",
  aguardando_pagamento: "PIX pendente",
  pago_pendente_hostex: "Pago · equipe conclui",
  processed: "Bloqueado",
};

const hojeIso = () => format(new Date(), "yyyy-MM-dd");

/**
 * Bloqueios de datas futuros de um imóvel pedidos pelo proprietário, com o
 * botão de liberar (bloqueio feito) ou cancelar (pedido ainda não processado).
 * Chama `liberar-bloqueio`: reabre as noites na Hostex e marca `liberado`.
 * Pedido do gestor em 2026-10-31 (CLAUDE.md §3.21). A taxa paga não volta sozinha.
 * A área fica sempre visível, com estado vazio, para o proprietário saber que
 * é aqui que se libera (pedido do gestor em 2026-11-01); antes sumia sem bloqueio.
 */
export function MeusBloqueios({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [liberando, setLiberando] = useState<string | null>(null);
  const chave = ["bloqueios", "meus", propertyId];

  const { data: bloqueios = [], isLoading } = useQuery({
    queryKey: chave,
    staleTime: 30_000,
    queryFn: async (): Promise<Bloqueio[]> => {
      const { data, error } = await db
        .from("date_block_requests")
        .select("id, start_date, end_date, reason, status, valor_cents, pago_em")
        .eq("property_id", propertyId)
        .in("status", ["pending", "aguardando_pagamento", "pago_pendente_hostex", "processed"])
        .gte("end_date", hojeIso())
        .order("start_date");
      if (error) throw error;
      return (data ?? []) as Bloqueio[];
    },
  });

  const liberar = async (b: Bloqueio) => {
    setLiberando(b.id);
    try {
      const { data, error } = await supabase.functions.invoke<{ status: string; resultado?: string; aviso?: string | null }>("liberar-bloqueio", {
        body: { id: b.id },
      });
      if (error) throw error;
      toast({
        title: data?.status === "cancelado" ? "Pedido cancelado" : "Datas liberadas",
        description: data?.aviso ?? data?.resultado ?? undefined,
      });
      setConfirmando(null);
      void qc.invalidateQueries({ queryKey: chave });
      void qc.invalidateQueries({ queryKey: ["painel"] });
    } catch (err) {
      toast({ title: await descreverErroDaFunction(err, "Não consegui liberar as datas. Tente de novo."), variant: "destructive" });
    } finally {
      setLiberando(null);
    }
  };

  return (
    <div className="space-y-2 border-t pt-3">
      <div>
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <CalendarX className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          Seus bloqueios neste imóvel
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">Para liberar datas já bloqueadas ou cancelar um pedido.</p>
      </div>
      {isLoading ? (
        <div className="space-y-1.5" aria-busy="true" aria-label="Carregando bloqueios">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      ) : bloqueios.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/70 px-3 py-2.5 text-xs text-muted-foreground">
          Nenhuma data bloqueada daqui para frente. Quando você bloquear, as datas aparecem aqui com o botão de liberar.
        </p>
      ) : (
      <ul className="space-y-1.5">
        {bloqueios.map((b) => {
          const entrada = lerDiaLocal(b.start_date);
          const saida = lerDiaLocal(b.end_date);
          const noites = differenceInCalendarDays(saida, entrada);
          const feito = b.status === "processed";
          const podeMexer = feito || b.status === "pending" || b.status === "aguardando_pagamento";
          const Icone = b.reason === "family_visit" ? Users : Wrench;
          return (
            <li key={b.id} className="rounded-lg border border-border/70 px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <Icone className={b.reason === "family_visit" ? "h-3.5 w-3.5 text-info" : "h-3.5 w-3.5 text-warning"} aria-hidden="true" />
                  {format(entrada, "dd/MM")} a {format(saida, "dd/MM")} · {noites} {noites === 1 ? "noite" : "noites"}
                </span>
                <span className="text-muted-foreground">{STATUS[b.status]}</span>
              </div>
              {typeof b.valor_cents === "number" && (
                <p className="mt-0.5 text-muted-foreground">
                  Taxa de limpeza {formatarBRL(b.valor_cents)}
                  {b.pago_em ? " · paga" : ""}
                </p>
              )}
              {podeMexer && (
                <div className="mt-1.5 flex items-center gap-2">
                  {confirmando === b.id ? (
                    <>
                      <span className="flex-1 text-muted-foreground">
                        {feito
                          ? `As noites voltam à venda. ${b.pago_em ? "A taxa paga não é devolvida automaticamente." : ""}`
                          : "O pedido é retirado; nada foi bloqueado."}
                      </span>
                      <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={() => void liberar(b)} disabled={liberando === b.id}>
                        {liberando === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirmar"}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setConfirmando(null)} disabled={liberando === b.id}>
                        Voltar
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setConfirmando(b.id)}>
                      {feito ? "Liberar datas" : "Cancelar pedido"}
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      )}
    </div>
  );
}
