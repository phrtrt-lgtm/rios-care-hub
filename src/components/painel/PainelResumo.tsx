import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, DollarSign, MessageSquare, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useGuestCharges } from "@/hooks/useGuestCharges";
import { formatBRL } from "@/lib/format";
import { estaVencida } from "@/lib/vencimento";
import { cn } from "@/lib/utils";

const STATUS_ABERTOS = ["novo", "em_analise", "aguardando_info", "em_execucao"] as const;

interface Resumo {
  vencidas: number;
  valorVencido: number;
  chamadosNovos: number;
  manutencoesAbertas: number;
  manutencoesSemAgenda: number;
  urgentesAbertos: number;
}

/**
 * Números do topo do painel. Cada um usa a mesma definição da caixa
 * correspondente logo abaixo, para os dois nunca discordarem.
 *
 * Corrige o que o painel mostrava antes: "Urgentes" contava chamados já
 * concluídos (37 contra 3 abertos de verdade), e as caixas mostravam o
 * teto da consulta (15, 50) no lugar do total.
 */
async function buscarResumo(): Promise<Resumo> {
  const [cobrancas, chamados, manutencoes, urgentes] = await Promise.all([
    supabase
      .from("charges")
      .select("status, due_date, amount_cents, management_contribution_cents, credit_applied_cents")
      .in("status", ["pendente", "sent", "overdue"])
      .is("archived_at", null),
    supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .neq("ticket_type", "manutencao")
      .eq("status", "novo"),
    supabase
      .from("tickets")
      .select("status, scheduled_at")
      .eq("ticket_type", "manutencao")
      .in("status", STATUS_ABERTOS)
      .is("archived_at", null),
    supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("priority", "urgente")
      .in("status", STATUS_ABERTOS),
  ]);

  const vencidas = (cobrancas.data || []).filter((c) => estaVencida(c.due_date, c.status));
  const valorVencido = vencidas.reduce(
    (soma, c) =>
      soma +
      Math.max(0, c.amount_cents - (c.management_contribution_cents || 0) - (c.credit_applied_cents || 0)),
    0,
  );

  const abertas = manutencoes.data || [];

  return {
    vencidas: vencidas.length,
    valorVencido,
    chamadosNovos: chamados.count ?? 0,
    manutencoesAbertas: abertas.length,
    manutencoesSemAgenda: abertas.filter(
      (t) => ["novo", "em_analise", "aguardando_info"].includes(t.status) && !t.scheduled_at,
    ).length,
    urgentesAbertos: urgentes.count ?? 0,
  };
}

interface IndicadorProps {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  icone: ReactNode;
  destaque?: "destructive" | "warning" | "info" | "success" | "neutral";
  onClick?: () => void;
}

const DESTAQUE: Record<NonNullable<IndicadorProps["destaque"]>, string> = {
  destructive: "border-l-destructive",
  warning: "border-l-warning",
  info: "border-l-info",
  success: "border-l-success",
  neutral: "border-l-border",
};

function Indicador({ rotulo, valor, detalhe, icone, destaque = "neutral", onClick }: IndicadorProps) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-lg border border-l-4 bg-card px-3 py-2.5 text-left",
        DESTAQUE[destaque],
        onClick && "transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icone}
        {rotulo}
      </span>
      <span className="text-2xl font-bold leading-none">{valor}</span>
      {detalhe && <span className="truncate text-xs text-muted-foreground">{detalhe}</span>}
    </Tag>
  );
}

export function PainelResumo({ onAbrirHospede }: { onAbrirHospede: () => void }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const podeVerListaManutencoes = profile?.role === "admin" || profile?.role === "maintenance";
  // TodosTickets só aceita admin e agent (a página devolve maintenance ao início).
  const podeVerTodosTickets = profile?.role === "admin" || profile?.role === "agent";

  const { data, isLoading } = useQuery({
    queryKey: ["painel", "resumo"],
    queryFn: buscarResumo,
    staleTime: 60_000,
  });
  const { data: hospede = [] } = useGuestCharges();
  const prontasHospede = hospede.filter((h) => h.grupo === "pronta").length;

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[84px] rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("grid grid-cols-2 gap-3", prontasHospede > 0 ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
      <Indicador
        rotulo="Cobranças vencidas"
        valor={data.vencidas}
        detalhe={data.vencidas > 0 ? `${formatBRL(data.valorVencido)} em aberto` : "Nada vencido"}
        icone={<DollarSign className="h-3.5 w-3.5" aria-hidden="true" />}
        destaque={data.vencidas > 0 ? "destructive" : "success"}
        onClick={() => navigate("/gerenciar-cobrancas")}
      />
      <Indicador
        rotulo="Chamados novos"
        valor={data.chamadosNovos}
        detalhe="Aguardando primeira resposta"
        icone={<MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />}
        destaque={data.chamadosNovos > 0 ? "info" : "neutral"}
        onClick={() => navigate("/admin/chamados")}
      />
      <Indicador
        rotulo="Manutenções abertas"
        valor={data.manutencoesAbertas}
        detalhe={`${data.manutencoesSemAgenda} sem agendamento`}
        icone={<Wrench className="h-3.5 w-3.5" aria-hidden="true" />}
        destaque={data.manutencoesSemAgenda > 0 ? "warning" : "neutral"}
        onClick={podeVerListaManutencoes ? () => navigate("/admin/manutencoes-lista") : undefined}
      />
      <Indicador
        rotulo="Urgentes abertos"
        valor={data.urgentesAbertos}
        detalhe="Chamados e manutenções"
        icone={<AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
        destaque={data.urgentesAbertos > 0 ? "destructive" : "neutral"}
        onClick={
          podeVerTodosTickets ? () => navigate("/todos-tickets?priority=urgente&status=abertos") : undefined
        }
      />
      {prontasHospede > 0 && (
        <Indicador
          rotulo="Cobrança de hóspede"
          valor={prontasHospede}
          detalhe={prontasHospede === 1 ? "pronta para cobrar" : "prontas para cobrar"}
          icone={<DollarSign className="h-3.5 w-3.5" aria-hidden="true" />}
          destaque="success"
          onClick={onAbrirHospede}
        />
      )}
    </div>
  );
}
