import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, Hotel, MessageSquare, Star, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOwnerScore } from "@/hooks/useOwnerScore";
import { ownerScopeFilter } from "@/lib/ownerScope";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Indicador, IndicadorSkeleton } from "./Indicador";

interface Resumo {
  cobrancas: number;
  valorCobrancas: number;
  chamados: number;
  manutencoes: number;
  comissoes: number;
  valorComissoes: number;
}

/**
 * Números do topo do painel do proprietário.
 *
 * Cada um usa a mesma definição da caixa correspondente logo abaixo. Nem os
 * números nem as caixas têm teto de consulta: com teto, a caixa mostrava só
 * parte das cobranças e o total ficava menor que o da gestão.
 * - cobranças: OwnerChargesPreview;
 * - chamados: OwnerTicketsPreview;
 * - manutenções: OwnerMaintenanceProgress;
 * - comissões: OwnerBookingCommissionsPreview.
 */
async function buscarResumo(userId: string): Promise<Resumo> {
  const escopo = await ownerScopeFilter(userId);
  const [cobrancas, chamados, manutencoes, comissoes] = await Promise.all([
    supabase
      .from("charges")
      .select("amount_cents, management_contribution_cents, credit_applied_cents")
      .or(escopo)
      .in("status", ["pendente", "sent", "overdue"])
      .is("archived_at", null),
    supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .or(escopo)
      .neq("ticket_type", "manutencao")
      .in("status", ["novo", "em_analise", "aguardando_info"]),
    supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .or(escopo)
      .eq("ticket_type", "manutencao")
      .or("cost_responsible.is.null,cost_responsible.neq.guest")
      .in("status", ["novo", "em_analise", "aguardando_info", "em_execucao"]),
    supabase
      .from("booking_commissions")
      .select("total_due_cents")
      .or(escopo)
      .in("status", ["sent", "pendente", "overdue"]),
  ]);

  const listaCobrancas = cobrancas.data || [];
  const listaComissoes = comissoes.data || [];

  return {
    cobrancas: listaCobrancas.length,
    valorCobrancas: listaCobrancas.reduce(
      (soma, c) =>
        soma +
        Math.max(0, c.amount_cents - (c.management_contribution_cents || 0) - (c.credit_applied_cents || 0)),
      0,
    ),
    chamados: chamados.count ?? 0,
    manutencoes: manutencoes.count ?? 0,
    comissoes: listaComissoes.length,
    valorComissoes: listaComissoes.reduce((soma, c) => soma + (c.total_due_cents || 0), 0),
  };
}

export function OwnerResumo() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["minha-caixa", "resumo", user?.id],
    queryFn: () => buscarResumo(user!.id),
    enabled: !!user?.id,
    staleTime: 60_000,
  });
  const { data: score } = useOwnerScore(user?.id);

  const temComissoes = (data?.comissoes ?? 0) > 0;
  const grade = cn("grid grid-cols-2 gap-3", temComissoes ? "lg:grid-cols-5" : "lg:grid-cols-4");

  if (isLoading || !data) {
    return (
      <div className={grade}>
        {Array.from({ length: 4 }).map((_, i) => (
          <IndicadorSkeleton key={i} />
        ))}
      </div>
    );
  }

  const scoreAtivo = (score?.totalCharges ?? 0) >= 3;

  return (
    <div className={grade}>
      <Indicador
        rotulo={data.cobrancas === 1 ? "Cobrança em aberto" : "Cobranças em aberto"}
        valor={data.cobrancas}
        detalhe={data.cobrancas > 0 ? `${formatBRL(data.valorCobrancas)} a pagar` : "Nada a pagar"}
        icone={<DollarSign className="h-4 w-4" aria-hidden="true" />}
        tom={data.cobrancas > 0 ? "warning" : "success"}
        realcarValor={data.cobrancas > 0}
        onClick={() => navigate("/minhas-cobrancas")}
      />
      {temComissoes && (
        <Indicador
          rotulo="Comissões Booking"
          valor={data.comissoes}
          detalhe={`${formatBRL(data.valorComissoes)} a pagar`}
          icone={<Hotel className="h-4 w-4" aria-hidden="true" />}
          tom="warning"
          realcarValor
          onClick={() => navigate("/minhas-comissoes-booking")}
        />
      )}
      <Indicador
        rotulo="Manutenções em andamento"
        valor={data.manutencoes}
        detalhe={data.manutencoes > 0 ? "Acompanhe o progresso abaixo" : "Nenhuma no momento"}
        icone={<Wrench className="h-4 w-4" aria-hidden="true" />}
        tom={data.manutencoes > 0 ? "primary" : "neutral"}
        onClick={() => navigate("/manutencoes")}
      />
      <Indicador
        rotulo="Chamados abertos"
        valor={data.chamados}
        detalhe={data.chamados > 0 ? "Em atendimento pela equipe" : "Nenhum chamado aberto"}
        icone={<MessageSquare className="h-4 w-4" aria-hidden="true" />}
        tom={data.chamados > 0 ? "info" : "neutral"}
        onClick={() => navigate("/meus-chamados")}
      />
      <Indicador
        rotulo="Score de pagamentos"
        valor={scoreAtivo ? (score?.currentScore ?? "—") : "—"}
        detalhe={scoreAtivo ? score?.starLabel : "Ativa após 3 cobranças"}
        icone={<Star className="h-4 w-4" aria-hidden="true" />}
        tom={scoreAtivo ? "primary" : "neutral"}
        onClick={() => document.getElementById("score-pagamentos")?.scrollIntoView({ behavior: "smooth", block: "start" })}
      />
    </div>
  );
}
