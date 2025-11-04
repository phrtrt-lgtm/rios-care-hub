import { Card, CardContent } from "@/components/ui/card";
import { formatBRL } from "@/lib/format";

interface MaintenanceSummaryCardsProps {
  summary: {
    openCount: number;
    completedCount: number;
    paidCount: number;
    totalCents: number;
    avgOrderCents: number;
    nextPayments?: any[];
  } | null;
}

export function MaintenanceSummaryCards({ summary }: MaintenanceSummaryCardsProps) {
  if (!summary) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="pt-6">
          <div className="text-sm text-muted-foreground mb-1">Gasto Total YTD</div>
          <div className="text-2xl font-semibold">{formatBRL(summary.totalCents)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            Média: {formatBRL(summary.avgOrderCents)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="text-sm text-muted-foreground mb-1">Abertas</div>
          <div className="text-2xl font-semibold">{summary.openCount}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="text-sm text-muted-foreground mb-1">Concluídas</div>
          <div className="text-2xl font-semibold">{summary.completedCount}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="text-sm text-muted-foreground mb-1">Pagas</div>
          <div className="text-2xl font-semibold">{summary.paidCount}</div>
        </CardContent>
      </Card>
    </div>
  );
}
