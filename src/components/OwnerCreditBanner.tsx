import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Wallet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatBRL } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatarData, valorDevido } from "@/lib/cobrancaMeta";
import { aplicarSaldoCredor, previaAbatimento, STATUS_ABATIVEIS } from "@/lib/saldoCredor";
import { cn } from "@/lib/utils";

interface OwnerCreditBannerProps {
  ownerId?: string;
  /** Chamado depois que o saldo foi usado, para a página recarregar as cobranças. */
  onSaldoUsado?: () => void;
}

interface CobrancaAbativel {
  id: string;
  title: string;
  amount_cents: number;
  management_contribution_cents: number | null;
  credit_applied_cents: number | null;
  due_date: string | null;
  property: { name: string } | null;
}

export const OwnerCreditBanner = ({ ownerId, onSaldoUsado }: OwnerCreditBannerProps) => {
  const [dialogoAberto, setDialogoAberto] = useState(false);

  const { data: credits } = useQuery({
    queryKey: ["owner-credits", ownerId],
    queryFn: async () => {
      if (!ownerId) return [];
      const { data, error } = await supabase
        .from("owner_credits")
        .select("id, remaining_amount_cents, origin_note, created_at, status")
        .eq("owner_id", ownerId)
        .eq("status", "open")
        .gt("remaining_amount_cents", 0)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!ownerId,
  });

  const { data: cobrancas = [] } = useQuery({
    queryKey: ["owner-credits", ownerId, "cobrancas-abativeis"],
    enabled: !!ownerId && (credits?.length ?? 0) > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charges")
        .select("id, title, amount_cents, management_contribution_cents, credit_applied_cents, due_date, property:properties(name)")
        .eq("owner_id", ownerId!)
        .in("status", [...STATUS_ABATIVEIS])
        .is("archived_at", null)
        .is("paid_at", null)
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown as CobrancaAbativel[]).filter((c) => valorDevido(c) > 0);
    },
  });

  if (!credits || credits.length === 0) return null;

  const total = credits.reduce((s, c) => s + (c.remaining_amount_cents ?? 0), 0);

  return (
    <Card className="mb-6 border-success/30 bg-gradient-to-br from-success/10 via-success/5 to-background animate-fade-in">
      <CardContent className="p-4 flex items-start gap-3">
        <div className="p-2 rounded-lg bg-success/15">
          <Wallet className="h-5 w-5 text-success" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="font-semibold text-foreground">Saldo credor disponível</p>
            <p className="text-2xl font-bold text-success">{formatBRL(total)}</p>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {cobrancas.length > 0
              ? "Você pode usar este saldo para abater suas cobranças em aberto. O que sobrar fica guardado para as próximas."
              : "Este saldo será abatido nas suas próximas cobranças."}
          </p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {credits.slice(0, 3).map((c) => (
              <li key={c.id} className="flex justify-between gap-2">
                <span className="truncate">
                  {c.origin_note ?? "Retenção em reserva"} ·{" "}
                  {format(new Date(c.created_at), "dd/MM/yyyy", { locale: ptBR })}
                </span>
                <span className="font-medium text-foreground shrink-0">
                  {formatBRL(c.remaining_amount_cents)}
                </span>
              </li>
            ))}
          </ul>
          {cobrancas.length > 0 && (
            <Button variant="success" size="sm" className="mt-3" onClick={() => setDialogoAberto(true)}>
              <Wallet className="h-4 w-4" />
              Usar nas cobranças
            </Button>
          )}
        </div>
      </CardContent>

      {ownerId && (
        <DialogoUsarSaldo
          aberto={dialogoAberto}
          aoMudar={setDialogoAberto}
          ownerId={ownerId}
          saldoCents={total}
          cobrancas={cobrancas}
          onUsado={onSaldoUsado}
        />
      )}
    </Card>
  );
};

function DialogoUsarSaldo({
  aberto,
  aoMudar,
  ownerId,
  saldoCents,
  cobrancas,
  onUsado,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  ownerId: string;
  saldoCents: number;
  cobrancas: CobrancaAbativel[];
  onUsado?: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);

  // Ao abrir, todas marcadas: o normal é usar o saldo inteiro.
  useEffect(() => {
    if (aberto) setEscolhidas(new Set(cobrancas.map((c) => c.id)));
  }, [aberto, cobrancas]);

  const previa = useMemo(
    () => previaAbatimento(cobrancas.filter((c) => escolhidas.has(c.id)), saldoCents),
    [cobrancas, escolhidas, saldoCents],
  );

  const alternar = (id: string) =>
    setEscolhidas((atual) => {
      const nova = new Set(atual);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });

  const confirmar = async () => {
    if (escolhidas.size === 0) return;
    setEnviando(true);
    try {
      const resultado = await aplicarSaldoCredor({ cobrancas: [...escolhidas], proprietarioId: ownerId });
      toast({
        title: "Saldo credor usado",
        description:
          `${formatBRL(resultado.aplicado_cents)} abatidos` +
          (resultado.quitadas > 0 ? `, ${resultado.quitadas} cobrança(s) quitada(s)` : "") +
          (resultado.saldo_restante_cents > 0 ? `. Restam ${formatBRL(resultado.saldo_restante_cents)} de saldo.` : "."),
      });
      queryClient.invalidateQueries({ queryKey: ["owner-credits", ownerId] });
      onUsado?.();
      aoMudar(false);
    } catch (e) {
      toast({
        title: "Não foi possível usar o saldo",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Usar o saldo credor</DialogTitle>
          <DialogDescription>
            Escolha as cobranças. O saldo de {formatBRL(saldoCents)} é usado na ordem do vencimento.
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
          {cobrancas.map((c) => {
            const marcada = escolhidas.has(c.id);
            const abate = previa.porCobranca.get(c.id) ?? 0;
            const devido = valorDevido(c);
            return (
              <li key={c.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                    marcada ? "border-success/40 bg-success/5" : "border-border hover:bg-muted/40",
                  )}
                >
                  <Checkbox checked={marcada} onCheckedChange={() => alternar(c.id)} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium break-words">{c.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.property?.name ?? "Sem imóvel"}
                      {c.due_date && <> · Vence {formatarData(c.due_date, "dd/MM/yy")}</>}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-sm tabular-nums">
                    <p className={cn(abate > 0 && "text-muted-foreground line-through")}>{formatBRL(devido)}</p>
                    {abate > 0 && (
                      <p className="font-semibold">
                        {devido - abate <= 0 ? (
                          <span className="text-success">Quitada</span>
                        ) : (
                          formatBRL(devido - abate)
                        )}
                      </p>
                    )}
                  </div>
                </label>
              </li>
            );
          })}
        </ul>

        <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Saldo usado</span>
            <span className="font-medium tabular-nums text-success">−{formatBRL(previa.totalCents)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Saldo que fica guardado</span>
            <span className="font-medium tabular-nums">{formatBRL(previa.sobraCents)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => aoMudar(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button variant="success" onClick={confirmar} disabled={enviando || previa.totalCents === 0}>
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
            Usar {formatBRL(previa.totalCents)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
