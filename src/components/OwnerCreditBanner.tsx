import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Wallet } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface OwnerCreditBannerProps {
  ownerId?: string;
}

export const OwnerCreditBanner = ({ ownerId }: OwnerCreditBannerProps) => {
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
            Este valor foi retido a mais em reserva(s) e será abatido em cobranças futuras ou devolvido.
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
        </div>
      </CardContent>
    </Card>
  );
};
