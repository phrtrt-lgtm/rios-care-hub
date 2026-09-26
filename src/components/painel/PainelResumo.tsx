import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, DollarSign, MessageSquare, UserRound, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useGuestCharges } from "@/hooks/useGuestCharges";
import { formatBRL } from "@/lib/format";
import { estaVencida } from "@/lib/vencimento";
import { cn } from "@/lib/utils";
import { Indicador, IndicadorSkeleton } from "./Indicador";

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

  const grade = cn("grid grid-cols-2 gap-3", prontasHospede > 0 ? "lg:grid-cols-5" : "lg:grid-cols-4");

  if (isLoading || !data) {
    return (
      <div className={grade}>
        {Array.from({ length: 4 }).map((_, i) => (
          <IndicadorSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className={grade}>
      <Indicador
        rotulo="Cobranças vencidas"
        valor={data.vencidas}
        detalhe={data.vencidas > 0 ? `${formatBRL(data.valorVencido)} em aberto` : "Nada vencido"}
        icone={<DollarSign className="h-4 w-4" aria-hidden="true" />}
        tom={data.vencidas > 0 ? "destructive" : "success"}
        realcarValor={data.vencidas > 0}
        onClick={() => navigate("/gerenciar-cobrancas")}
      />
      <Indicador
        rotulo="Chamados novos"
        valor={data.chamadosNovos}
        detalhe="Aguardando primeira resposta"
        icone={<MessageSquare className="h-4 w-4" aria-hidden="true" />}
        tom={data.chamadosNovos > 0 ? "info" : "neutral"}
        onClick={() => navigate("/admin/chamados")}
      />
      <Indicador
        rotulo="Manutenções abertas"
        valor={data.manutencoesAbertas}
        detalhe={`${data.manutencoesSemAgenda} sem agendamento`}
        icone={<Wrench className="h-4 w-4" aria-hidden="true" />}
        tom={data.manutencoesSemAgenda > 0 ? "warning" : "neutral"}
        onClick={podeVerListaManutencoes ? () => navigate("/admin/manutencoes-lista") : undefined}
      />
      <Indicador
        rotulo="Urgentes abertos"
        valor={data.urgentesAbertos}
        detalhe="Chamados e manutenções"
        icone={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
        tom={data.urgentesAbertos > 0 ? "destructive" : "neutral"}
        realcarValor={data.urgentesAbertos > 0}
        onClick={
          podeVerTodosTickets ? () => navigate("/todos-tickets?priority=urgente&status=abertos") : undefined
        }
      />
      {prontasHospede > 0 && (
        <Indicador
          rotulo="Cobrança de hóspede"
          valor={prontasHospede}
          detalhe={prontasHospede === 1 ? "pronta para cobrar" : "prontas para cobrar"}
          icone={<UserRound className="h-4 w-4" aria-hidden="true" />}
          tom="success"
          onClick={onAbrirHospede}
        />
      )}
    </div>
  );
}
