import { Star, TrendingUp, TrendingDown, Clock, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useOwnerScore } from "@/hooks/useOwnerScore";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface OwnerScoreCardProps {
  ownerId: string;
  ownerName?: string;
}

const StarRating = ({ stars }: { stars: number }) => {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={14}
          className={
            i <= stars
              ? "fill-yellow-400 text-yellow-400"
              : "fill-muted text-muted-foreground/30"
          }
        />
      ))}
    </div>
  );
};

const getScoreColor = (score: number) => {
  if (score >= 90) return "text-emerald-500";
  if (score >= 75) return "text-blue-500";
  if (score >= 60) return "text-yellow-500";
  if (score >= 40) return "text-orange-500";
  return "text-red-500";
};

const getScoreBgColor = (score: number) => {
  if (score >= 90) return "bg-emerald-500";
  if (score >= 75) return "bg-blue-500";
  if (score >= 60) return "bg-yellow-500";
  if (score >= 40) return "bg-orange-500";
  return "bg-red-500";
};

const getReasonLabel = (reason: string) => {
  switch (reason) {
    case "early_payment":
      return "Pagamento antecipado";
    case "on_time_payment":
      return "Pagamento em dia";
    case "late_payment":
      return "Pagamento atrasado";
    case "reserve_debit":
      return "Débito em reserva";
    default:
      return reason;
  }
};

export const OwnerScoreCard = ({ ownerId, ownerName }: OwnerScoreCardProps) => {
  const { data: scoreData, isLoading } = useOwnerScore(ownerId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!scoreData) return null;

  const hasEnoughCharges = scoreData.totalCharges >= 3;
  const totalPaid = scoreData.paidEarly + scoreData.paidOnTime + scoreData.paidLate + scoreData.debitedFromReserve;
  const onTimeRate = totalPaid > 0 
    ? Math.round(((scoreData.paidEarly + scoreData.paidOnTime) / totalPaid) * 100) 
    : 0;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
          Score do Proprietário
          {ownerName && (
            <span className="text-muted-foreground font-normal">
              — {ownerName}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasEnoughCharges ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
            <Clock className="h-4 w-4" />
            <span>
              Score disponível após 3 cobranças ({scoreData.totalCharges}/3)
            </span>
          </div>
        ) : (
          <>
            {/* Score principal */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`text-3xl font-bold ${getScoreColor(
                    scoreData.currentScore
                  )}`}
                >
                  {scoreData.currentScore}
                </div>
                <div className="space-y-0.5">
                  <StarRating stars={scoreData.stars} />
                  <p className="text-xs text-muted-foreground">
                    {scoreData.starLabel}
                  </p>
                </div>
              </div>
              <Badge
                variant="outline"
                className={`${getScoreColor(scoreData.currentScore)}`}
              >
                {onTimeRate}% em dia
              </Badge>
            </div>

            {/* Barra de progresso */}
            <div className="space-y-1">
              <Progress 
                value={scoreData.currentScore} 
                className="h-2"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>0</span>
                <span>50</span>
                <span>100</span>
              </div>
            </div>

            {/* Estatísticas */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-emerald-500/10 rounded-lg p-2">
                <div className="text-lg font-semibold text-emerald-500">
                  {scoreData.paidEarly}
                </div>
                <div className="text-[10px] text-muted-foreground">Antecipados</div>
              </div>
              <div className="bg-blue-500/10 rounded-lg p-2">
                <div className="text-lg font-semibold text-blue-500">
                  {scoreData.paidOnTime}
                </div>
                <div className="text-[10px] text-muted-foreground">Em dia</div>
              </div>
              <div className="bg-orange-500/10 rounded-lg p-2">
                <div className="text-lg font-semibold text-orange-500">
                  {scoreData.paidLate}
                </div>
                <div className="text-[10px] text-muted-foreground">Atrasados</div>
              </div>
              <div className="bg-red-500/10 rounded-lg p-2">
                <div className="text-lg font-semibold text-red-500">
                  {scoreData.debitedFromReserve}
                </div>
                <div className="text-[10px] text-muted-foreground">Debitados</div>
              </div>
            </div>

            {/* Histórico recente */}
            {scoreData.history.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs font-medium mb-2">Últimos movimentos</p>
                <div className="space-y-1.5">
                  {scoreData.history.slice(0, 3).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between text-xs bg-muted/30 rounded px-2 py-1"
                    >
                      <div className="flex items-center gap-2">
                        {entry.points_change > 0 ? (
                          <TrendingUp className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <TrendingDown className="h-3 w-3 text-red-500" />
                        )}
                        <span className="text-muted-foreground">
                          {getReasonLabel(entry.reason)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            entry.points_change > 0
                              ? "text-emerald-500 font-medium"
                              : "text-red-500 font-medium"
                          }
                        >
                          {entry.points_change > 0 ? "+" : ""}
                          {entry.points_change}
                        </span>
                        <span className="text-muted-foreground/60">
                          {format(new Date(entry.created_at), "dd/MM", {
                            locale: ptBR,
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Alerta se score baixo */}
            {scoreData.currentScore < 60 && (
              <div className="flex items-start gap-2 text-xs bg-orange-500/10 border border-orange-500/20 rounded-lg p-2.5">
                <AlertCircle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-orange-600">Atenção ao histórico</p>
                  <p className="text-muted-foreground">
                    Score baixo indica pagamentos atrasados recorrentes. Considere com cuidado o percentual de aporte.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
