import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Pencil,
  Archive,
  ArchiveRestore,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Sparkles,
  History,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AuditEntry {
  id: string;
  action: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  details: any;
  created_at: string;
}

interface ReportAuditLogProps {
  reportId: string;
}

const ACTION_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  created: { label: "Criado", icon: Sparkles, color: "text-success" },
  updated: { label: "Atualizado", icon: Pencil, color: "text-primary" },
  archived: { label: "Arquivado", icon: Archive, color: "text-warning" },
  restored: { label: "Restaurado", icon: ArchiveRestore, color: "text-success" },
  deleted: { label: "Excluído", icon: Trash2, color: "text-destructive" },
  published: { label: "Publicado", icon: CheckCircle2, color: "text-success" },
  regenerated: { label: "Regerado", icon: RefreshCw, color: "text-primary" },
};

const formatDetails = (action: string, details: any): string | null => {
  if (!details) return null;
  if (action === "updated" && details.changes) {
    const parts: string[] = [];
    for (const [field, change] of Object.entries<any>(details.changes)) {
      const fieldLabel: Record<string, string> = {
        owner_id: "proprietário",
        commission_percentage: "% comissão",
        internal_notes: "anotações internas",
      };
      const label = fieldLabel[field] || field;
      parts.push(`${label}: "${change.from ?? "—"}" → "${change.to ?? "—"}"`);
    }
    return parts.join(" · ");
  }
  if (action === "archived" && details.reason) {
    return `Motivo: ${details.reason}`;
  }
  if (action === "regenerated" && details.previousTotals) {
    const p = details.previousTotals;
    return `Totais anteriores → reservas: ${p.reservationCount}, líquido: R$ ${(
      p.totalOwnerNet ?? 0
    ).toFixed(2)}`;
  }
  return null;
};

export function ReportAuditLog({ reportId }: ReportAuditLogProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data, error } = await supabase
        .from("financial_report_audit_log")
        .select("*")
        .eq("report_id", reportId)
        .order("created_at", { ascending: false });

      if (!error && data) setEntries(data as AuditEntry[]);
      setLoading(false);
    };
    fetch();
  }, [reportId]);

  return (
    <div className="container max-w-5xl px-2 sm:px-6 py-4">
      <Accordion
        type="single"
        collapsible
        className="bg-card border border-border rounded-xl overflow-hidden"
      >
        <AccordionItem value="audit" className="border-0">
          <AccordionTrigger className="px-4 sm:px-6 py-3 hover:no-underline">
            <div className="flex items-center gap-2 text-sm font-medium">
              <History className="h-4 w-4 text-muted-foreground" />
              Histórico de alterações
              {!loading && entries.length > 0 && (
                <span className="text-xs text-muted-foreground font-normal">
                  ({entries.length})
                </span>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 sm:px-6 pb-4">
            {loading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : entries.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                Nenhuma alteração registrada ainda.
              </p>
            ) : (
              <ol className="space-y-3 relative">
                {entries.map((e) => {
                  const meta = ACTION_META[e.action] ?? {
                    label: e.action,
                    icon: History,
                    color: "text-muted-foreground",
                  };
                  const Icon = meta.icon;
                  const detailText = formatDetails(e.action, e.details);
                  return (
                    <li
                      key={e.id}
                      className="flex gap-3 text-sm border-l-2 border-border pl-3 py-1"
                    >
                      <div className={`flex-shrink-0 ${meta.color}`}>
                        <Icon className="h-4 w-4 mt-0.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground">
                          {meta.label}
                          {e.actor_name && (
                            <span className="font-normal text-muted-foreground">
                              {" "}
                              · por {e.actor_name}
                              {e.actor_role && (
                                <span className="text-xs">
                                  {" "}
                                  ({e.actor_role})
                                </span>
                              )}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(
                            new Date(e.created_at),
                            "dd 'de' MMM 'de' yyyy 'às' HH:mm",
                            { locale: ptBR },
                          )}
                        </p>
                        {detailText && (
                          <p className="text-xs text-muted-foreground mt-1 break-words">
                            {detailText}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
