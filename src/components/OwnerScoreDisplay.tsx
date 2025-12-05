import { Star, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOwnerScore } from "@/hooks/useOwnerScore";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const StarRating = ({ stars, size = 20 }: { stars: number; size?: number }) => {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
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

const getReasonIcon = (pointsChange: number) => {
  if (pointsChange > 0)
    return <TrendingUp className="h-3 w-3 text-emerald-500" />;
  if (pointsChange < 0)
    return <TrendingDown className="h-3 w-3 text-red-500" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
};

export const OwnerScoreDisplay = () => {
  const { user } = useAuth();
  const { data: scoreData, isLoading } = useOwnerScore(user?.id);

  if (isLoading) {
    return (
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!scoreData) return null;

  // Only show after 3+ charges
  if (scoreData.totalCharges < 3) {
    return (
      <Card className="bg-gradient-to-br from-muted/50 to-muted/30 border-muted">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star
                  key={i}
                  size={16}
                  className="fill-muted text-muted-foreground/30"
                />
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              Seu score será calculado após 3 cobranças
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Prepare chart data from history (reverse to show oldest first)
  const chartData = [...scoreData.history]
    .reverse()
    .slice(-10)
    .map((entry) => ({
      date: format(new Date(entry.created_at), "dd/MM", { locale: ptBR }),
      score: entry.score_after,
    }));

  return (
    <Card className="bg-gradient-to-br from-primary/5 via-background to-primary/10 border-primary/20 overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-medium flex items-center gap-2">
          <Star className="h-5 w-5 text-yellow-400 fill-yellow-400" />
          Meu Score de Pagamentos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score principal com estrelas */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div
                className={`text-4xl font-bold ${getScoreColor(
                  scoreData.currentScore
                )}`}
              >
                {scoreData.currentScore}
              </div>
              <div className="text-xs text-muted-foreground text-center">
                pontos
              </div>
            </div>
            <div className="space-y-1">
              <StarRating stars={scoreData.stars} size={24} />
              <p className="text-sm font-medium text-muted-foreground">
                {scoreData.starLabel}
              </p>
            </div>
          </div>

          {/* Mini stats */}
          <div className="text-right text-sm space-y-0.5">
            <div className="text-emerald-500">
              {scoreData.paidEarly + scoreData.paidOnTime} em dia
            </div>
            {scoreData.paidLate > 0 && (
              <div className="text-orange-500">{scoreData.paidLate} atrasados</div>
            )}
          </div>
        </div>

        {/* Gráfico de evolução */}
        {chartData.length > 1 && (
          <div className="pt-2">
            <p className="text-xs text-muted-foreground mb-2">
              Evolução do Score
            </p>
            <div className="h-24">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number) => [`${value} pts`, "Score"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))", r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Histórico recente */}
        {scoreData.history.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-2">
              Últimas Movimentações
            </p>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {scoreData.history.slice(0, 5).map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-1.5">
                    {getReasonIcon(entry.points_change)}
                    <span className="text-muted-foreground">
                      {getReasonLabel(entry.reason)}
                    </span>
                  </div>
                  <span
                    className={
                      entry.points_change > 0
                        ? "text-emerald-500 font-medium"
                        : entry.points_change < 0
                        ? "text-red-500 font-medium"
                        : "text-muted-foreground"
                    }
                  >
                    {entry.points_change > 0 ? "+" : ""}
                    {entry.points_change}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
