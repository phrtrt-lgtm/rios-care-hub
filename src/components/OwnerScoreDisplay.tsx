import { useState } from "react";
import { Star, TrendingUp, TrendingDown, Minus, Info, ChevronDown, ChevronUp, Gift, Clock, AlertTriangle, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOwnerScore } from "@/hooks/useOwnerScore";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  const [showInfo, setShowInfo] = useState(false);

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
              Seu score será calculado após 3 cobranças ({scoreData.totalCharges}/3)
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
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-medium flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-400 fill-yellow-400" />
            Meu Score de Pagamentos
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowInfo(!showInfo)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Info className="h-4 w-4 mr-1" />
            {showInfo ? "Fechar" : "Como funciona?"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Explicação do sistema */}
        <Collapsible open={showInfo} onOpenChange={setShowInfo}>
          <CollapsibleContent>
            <div className="bg-muted/50 rounded-lg p-4 mb-4 space-y-3">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Info className="h-4 w-4 text-primary" />
                Como funciona o Score de Pagamentos
              </h4>
              <p className="text-sm text-muted-foreground">
                Seu score reflete seu histórico de pagamentos e pode influenciar benefícios futuros.
                Mantenha um bom score para aproveitar condições especiais!
              </p>
              
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="flex items-start gap-2 bg-emerald-500/10 rounded-lg p-2.5">
                  <Gift className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-emerald-600">Pagamento Antecipado</p>
                    <p className="text-xs text-muted-foreground">+5 pontos (2+ dias antes)</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-2 bg-blue-500/10 rounded-lg p-2.5">
                  <Clock className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-blue-600">Pagamento em Dia</p>
                    <p className="text-xs text-muted-foreground">+1 ponto</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-2 bg-orange-500/10 rounded-lg p-2.5">
                  <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-orange-600">Pagamento Atrasado</p>
                    <p className="text-xs text-muted-foreground">-15 pontos</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-2 bg-red-500/10 rounded-lg p-2.5">
                  <Zap className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-red-600">Débito em Reserva</p>
                    <p className="text-xs text-muted-foreground">-30 pontos</p>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  <strong>Níveis de classificação:</strong>
                </p>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  <span className="text-xs bg-emerald-500/20 text-emerald-600 px-2 py-0.5 rounded">90-100: Excelente ★★★★★</span>
                  <span className="text-xs bg-blue-500/20 text-blue-600 px-2 py-0.5 rounded">75-89: Muito Bom ★★★★</span>
                  <span className="text-xs bg-yellow-500/20 text-yellow-600 px-2 py-0.5 rounded">60-74: Bom ★★★</span>
                  <span className="text-xs bg-orange-500/20 text-orange-600 px-2 py-0.5 rounded">40-59: Regular ★★</span>
                  <span className="text-xs bg-red-500/20 text-red-600 px-2 py-0.5 rounded">0-39: Atenção ★</span>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

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

        {/* Dica de bônus */}
        {scoreData.currentScore < 90 && (
          <div className="flex items-start gap-2 text-xs bg-primary/5 border border-primary/10 rounded-lg p-2.5">
            <Gift className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-primary">Dica para aumentar seu score</p>
              <p className="text-muted-foreground">
                Pague suas cobranças com 2 ou mais dias de antecedência para ganhar +5 pontos por pagamento!
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
