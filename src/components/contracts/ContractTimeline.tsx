import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const LABEL: Record<string, string> = {
  created: "Pré-contrato criado pela RIOS",
  owner_started_filling: "Proprietário iniciou o preenchimento",
  owner_saved_draft: "Rascunho salvo",
  owner_submitted: "Proprietário enviou os dados",
  rios_requested_correction: "RIOS solicitou correção",
  owner_resubmitted: "Proprietário reenviou após correção",
  rios_approved: "RIOS aprovou os dados",
  contract_generated: "Contrato final gerado",
  contract_signed: "Contrato assinado",
  contract_cancelled: "Contrato cancelado",
};

export function ContractTimeline({ contractId }: { contractId: string }) {
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("contract_events")
        .select("*")
        .eq("contract_id", contractId)
        .order("created_at", { ascending: false });
      setEvents(data ?? []);
    })();
  }, [contractId]);

  if (!events.length) return <p className="text-sm text-muted-foreground">Sem eventos registrados.</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Histórico</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="relative border-l pl-5 space-y-4">
          {events.map((e) => (
            <li key={e.id}>
              <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-primary" />
              <p className="text-sm font-medium">{LABEL[e.event_type] ?? e.event_type}</p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(e.created_at), { addSuffix: true, locale: ptBR })}
                {e.actor_role ? ` · ${e.actor_role}` : ""}
              </p>
              {e.payload?.message ? <p className="text-xs mt-1">{e.payload.message}</p> : null}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
