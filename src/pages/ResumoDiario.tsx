import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, AlertTriangle, Clock, CheckCircle, Calendar, Wrench, Bell, FileText, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MobileBottomNav } from "@/components/MobileBottomNav";

interface DailySummary {
  date: string;
  ticketsNovos: number;
  ticketsUrgentes: number;
  ticketsAguardando: number;
  cobrancasVencendo: number;
  cobrancasAtrasadas: number;
  vistoriasHoje: number;
  manutencoesAgendadas: number;
  alertasAtivos: number;
  resumoIA: string;
}

export default function ResumoDiario() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);

  const isTeamMember = profile?.role && ["admin", "agent", "maintenance"].includes(profile.role);

  const fetchSummary = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("daily-summary", {
        body: { userId: user.id },
      });

      if (error) throw error;
      setSummary(data);
    } catch (error) {
      console.error("Error fetching summary:", error);
      toast.error("Erro ao carregar resumo");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [user]);

  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const StatCard = ({ 
    icon: Icon, 
    label, 
    value, 
    variant = "default",
    onClick 
  }: { 
    icon: any; 
    label: string; 
    value: number; 
    variant?: "default" | "warning" | "danger" | "success";
    onClick?: () => void;
  }) => {
    const variants = {
      default: "bg-info/10 text-info border-info/30",
      warning: "bg-warning/10 text-warning border-warning/30",
      danger: "bg-destructive/10 text-destructive border-destructive/30",
      success: "bg-success/10 text-success border-success/30",
    };

    return (
      <Card 
        className={`${variants[variant]} border cursor-pointer hover:shadow-md transition-shadow`}
        onClick={onClick}
      >
        <CardContent className="p-4 flex items-center gap-4">
          <div className={`p-3 rounded-full ${
            variant === "danger" ? "bg-destructive/10" :
            variant === "warning" ? "bg-warning/10" :
            variant === "success" ? "bg-success/10" :
            "bg-info/10"
          }`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm opacity-80">{label}</p>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-blue-600 text-white p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/painel")}
              className="text-white hover:bg-white/20"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">☀️ Resumo Diário</h1>
              <p className="text-blue-100 text-sm capitalize">{today}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchSummary}
              disabled={loading}
              className="text-white hover:bg-white/20"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* AI Summary */}
        {loading ? (
          <Card className="bg-info/10 border-info/30">
            <CardContent className="p-6">
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        ) : summary?.resumoIA ? (
          <Card className="bg-gradient-to-r from-info/10 to-indigo-50 border-info/30">
            <CardContent className="p-6">
              <div className="flex items-start gap-3">
                <span className="text-2xl">💡</span>
                <p className="text-info leading-relaxed">{summary.resumoIA}</p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          {loading ? (
            <>
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </>
          ) : summary ? (
            <>
              <StatCard
                icon={AlertTriangle}
                label="Tickets Urgentes"
                value={summary.ticketsUrgentes}
                variant={summary.ticketsUrgentes > 0 ? "danger" : "success"}
                onClick={() => navigate("/todos-tickets?priority=urgente")}
              />
              <StatCard
                icon={FileText}
                label="Tickets Novos"
                value={summary.ticketsNovos}
                variant="default"
                onClick={() => navigate("/todos-tickets?status=novo")}
              />
              <StatCard
                icon={Clock}
                label="Aguardando Info"
                value={summary.ticketsAguardando}
                variant={summary.ticketsAguardando > 0 ? "warning" : "default"}
                onClick={() => navigate("/todos-tickets?status=aguardando_info")}
              />
              <StatCard
                icon={CreditCard}
                label="Cobranças Atrasadas"
                value={summary.cobrancasAtrasadas}
                variant={summary.cobrancasAtrasadas > 0 ? "danger" : "success"}
                onClick={() => navigate("/gerenciar-cobrancas?status=atrasado")}
              />
              <StatCard
                icon={CreditCard}
                label="Vencendo Hoje/Amanhã"
                value={summary.cobrancasVencendo}
                variant={summary.cobrancasVencendo > 0 ? "warning" : "default"}
                onClick={() => navigate("/gerenciar-cobrancas")}
              />
              {isTeamMember && (
                <>
                  <StatCard
                    icon={CheckCircle}
                    label="Vistorias Hoje"
                    value={summary.vistoriasHoje}
                    variant="default"
                    onClick={() => navigate("/admin-vistorias")}
                  />
                  <StatCard
                    icon={Wrench}
                    label="Manutenções Agendadas"
                    value={summary.manutencoesAgendadas}
                    variant="default"
                    onClick={() => navigate("/manutencoes")}
                  />
                  <StatCard
                    icon={Bell}
                    label="Alertas Ativos"
                    value={summary.alertasAtivos}
                    variant={summary.alertasAtivos > 0 ? "warning" : "default"}
                    onClick={() => navigate("/painel")}
                  />
                </>
              )}
            </>
          ) : null}
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Ações Rápidas</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Button 
              variant="outline" 
              className="justify-start"
              onClick={() => navigate("/todos-tickets")}
            >
              <FileText className="h-4 w-4 mr-2" />
              Ver Tickets
            </Button>
            <Button 
              variant="outline" 
              className="justify-start"
              onClick={() => navigate("/gerenciar-cobrancas")}
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Ver Cobranças
            </Button>
            {isTeamMember && (
              <>
                <Button 
                  variant="outline" 
                  className="justify-start"
                  onClick={() => navigate("/manutencoes")}
                >
                  <Wrench className="h-4 w-4 mr-2" />
                  Manutenções
                </Button>
                <Button 
                  variant="outline" 
                  className="justify-start"
                  onClick={() => navigate("/admin-vistorias")}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Vistorias
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <MobileBottomNav />
    </div>
  );
}
