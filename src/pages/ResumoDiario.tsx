import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle,
  Clock,
  CreditCard,
  FileText,
  Lightbulb,
  RefreshCw,
  Sun,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { CabecalhoPagina, PaginaInterna } from "@/components/painel/PaginaInterna";
import { CaixaOperacao } from "@/components/painel/CaixaOperacao";
import { TOM, type Tom } from "@/components/painel/tons";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

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

function StatCard({
  icone,
  rotulo,
  valor,
  tom = "info",
  onClick,
}: {
  icone: ReactNode;
  rotulo: string;
  valor: number;
  tom?: Tom;
  onClick?: () => void;
}) {
  return (
    <Card
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={onClick ? `${rotulo}: ${valor}. Abrir` : undefined}
      className={cn(
        "flex items-center gap-3 rounded-xl border-border/70 p-4 transition-colors",
        onClick && "cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <span
        className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg [&>svg]:h-5 [&>svg]:w-5", TOM[tom].caixa)}
        aria-hidden="true"
      >
        {icone}
      </span>
      <div className="min-w-0">
        <p className={cn("text-2xl font-bold leading-none tabular-nums", valor > 0 && tom !== "info" && TOM[tom].texto)}>{valor}</p>
        <p className="mt-1 text-xs text-muted-foreground">{rotulo}</p>
      </div>
    </Card>
  );
}

export default function ResumoDiario() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);

  const isTeamMember = !!profile?.role && ["admin", "agent", "maintenance"].includes(profile.role);
  const userId = user?.id;

  const fetchSummary = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setErro(false);
    try {
      const { data, error } = await supabase.functions.invoke("daily-summary", {
        body: { userId },
      });

      if (error) throw error;
      setSummary(data);
    } catch (error) {
      console.error("Erro ao carregar o resumo do dia:", error);
      setErro(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const hoje = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // O proprietário não entra nas telas da equipe: links da caixa dele.
  const rotaChamados = isTeamMember ? "/todos-tickets" : "/meus-chamados";
  const rotaCobrancas = isTeamMember ? "/gerenciar-cobrancas" : "/minhas-cobrancas";
  const inicio = isTeamMember ? "/painel" : "/minha-caixa";

  return (
    <PaginaInterna
      largura="media"
      comNavInferior
      cabecalho={
        <CabecalhoPagina
          titulo="Resumo do dia"
          subtitulo={<span className="capitalize">{hoje}</span>}
          icone={<Sun />}
          tom="warning"
          voltarPara={inicio}
          acoes={
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchSummary}
              disabled={loading}
              aria-label="Atualizar resumo"
              className="h-9 w-9"
            >
              <RefreshCw className={cn("h-5 w-5", loading && "animate-spin")} />
            </Button>
          }
        />
      }
    >
      {loading ? (
        <>
          <SectionSkeleton rows={1} showHeader />
          <div className="grid grid-cols-2 gap-3" aria-busy="true" aria-label="Carregando números do dia">
            {Array.from({ length: isTeamMember ? 8 : 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[76px] rounded-xl" />
            ))}
          </div>
        </>
      ) : erro || !summary ? (
        <Card className="rounded-xl border-border/70">
          <EmptyState
            icon={<AlertTriangle className="h-6 w-6" />}
            title="Não foi possível montar o resumo"
            description="Tente de novo em instantes."
            action={
              <Button variant="outline" onClick={fetchSummary}>
                <RefreshCw className="h-4 w-4" />
                Tentar de novo
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          {summary.resumoIA && (
            <CaixaOperacao icone={<Lightbulb />} titulo="Resumo da IA" tom="info">
              <p className="text-sm leading-relaxed">{summary.resumoIA}</p>
            </CaixaOperacao>
          )}

          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icone={<AlertTriangle />}
              rotulo="Chamados urgentes"
              valor={summary.ticketsUrgentes}
              tom={summary.ticketsUrgentes > 0 ? "destructive" : "success"}
              onClick={() => navigate(isTeamMember ? "/todos-tickets?priority=urgente" : rotaChamados)}
            />
            <StatCard
              icone={<FileText />}
              rotulo="Chamados novos"
              valor={summary.ticketsNovos}
              onClick={() => navigate(isTeamMember ? "/todos-tickets?status=novo" : rotaChamados)}
            />
            <StatCard
              icone={<Clock />}
              rotulo="Aguardando informação"
              valor={summary.ticketsAguardando}
              tom={summary.ticketsAguardando > 0 ? "warning" : "info"}
              onClick={() => navigate(isTeamMember ? "/todos-tickets?status=aguardando_info" : rotaChamados)}
            />
            <StatCard
              icone={<CreditCard />}
              rotulo="Cobranças atrasadas"
              valor={summary.cobrancasAtrasadas}
              tom={summary.cobrancasAtrasadas > 0 ? "destructive" : "success"}
              onClick={() => navigate(isTeamMember ? "/gerenciar-cobrancas?status=atrasado" : rotaCobrancas)}
            />
            <StatCard
              icone={<CreditCard />}
              rotulo="Vencendo hoje ou amanhã"
              valor={summary.cobrancasVencendo}
              tom={summary.cobrancasVencendo > 0 ? "warning" : "info"}
              onClick={() => navigate(rotaCobrancas)}
            />
            {isTeamMember && (
              <>
                <StatCard
                  icone={<CheckCircle />}
                  rotulo="Vistorias hoje"
                  valor={summary.vistoriasHoje}
                  onClick={() => navigate("/admin/vistorias/todas")}
                />
                <StatCard
                  icone={<Wrench />}
                  rotulo="Manutenções agendadas"
                  valor={summary.manutencoesAgendadas}
                  onClick={() => navigate("/manutencoes")}
                />
                <StatCard
                  icone={<Bell />}
                  rotulo="Avisos ativos"
                  valor={summary.alertasAtivos}
                  tom={summary.alertasAtivos > 0 ? "warning" : "info"}
                  onClick={() => navigate("/painel")}
                />
              </>
            )}
          </div>

          <CaixaOperacao icone={<Calendar />} titulo="Atalhos" tom="neutral">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button variant="outline" className="justify-start" onClick={() => navigate(rotaChamados)}>
                <FileText className="h-4 w-4" />
                {isTeamMember ? "Ver chamados" : "Meus chamados"}
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => navigate(rotaCobrancas)}>
                <CreditCard className="h-4 w-4" />
                {isTeamMember ? "Ver cobranças" : "Minhas cobranças"}
              </Button>
              {isTeamMember && (
                <>
                  <Button variant="outline" className="justify-start" onClick={() => navigate("/manutencoes")}>
                    <Wrench className="h-4 w-4" />
                    Manutenções
                  </Button>
                  <Button variant="outline" className="justify-start" onClick={() => navigate("/admin/vistorias/todas")}>
                    <Calendar className="h-4 w-4" />
                    Vistorias
                  </Button>
                </>
              )}
            </div>
          </CaixaOperacao>
        </>
      )}
    </PaginaInterna>
  );
}
