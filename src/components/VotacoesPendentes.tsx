import { useNavigate, useLocation } from "react-router-dom";
import { saveScrollPosition } from "@/lib/navigation";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Vote, Calendar, ArrowRight } from "lucide-react";
import { CaixaOperacao, LinhaCaixa, SeloContagem } from "@/components/painel/CaixaOperacao";
import { useAuth } from "@/hooks/useAuth";

export function VotacoesPendentes() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, profile } = useAuth();

  const { data: pendingProposals, isLoading } = useQuery({
    queryKey: ['pending-proposals', user?.id, profile?.role],
    queryFn: async () => {
      if (!user) return [];

      // Para admins, mostrar todas as propostas ativas
      if (profile?.role === 'admin') {
        const { data, error } = await supabase
          .from('proposals')
          .select('*')
          .eq('status', 'active')
          .order('deadline', { ascending: true });
        
        if (error) throw error;
        return data || [];
      }

      // Para owners, mostrar apenas suas propostas pendentes
      const { data, error } = await supabase
        .from('proposals')
        .select(`
          *,
          proposal_responses!inner (
            id,
            approved,
            owner_id,
            selected_option_id
          )
        `)
        .eq('status', 'active')
        .eq('proposal_responses.owner_id', user.id)
        .is('proposal_responses.selected_option_id', null)
        .order('deadline', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  if (isLoading || !pendingProposals || pendingProposals.length === 0) {
    return null;
  }

  return (
    <CaixaOperacao
      icone={<Vote />}
      titulo="Propostas pendentes"
      tom="primary"
      selos={<SeloContagem tom="primary">{pendingProposals.length}</SeloContagem>}
      acoes={
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-primary hover:text-primary" onClick={() => navigate('/votacoes')}>
          Ver todas
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      }
    >
      <div className="space-y-1">
        {pendingProposals.slice(0, 3).map((proposal) => (
          <LinhaCaixa
            key={proposal.id}
            titulo={proposal.title}
            subtitulo={
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" aria-hidden="true" />
                Prazo: {new Date(proposal.deadline).toLocaleDateString('pt-BR')}
              </span>
            }
            meta={
              proposal.category ? (
                <Badge variant="outline" className="hidden font-normal sm:inline-flex">
                  {proposal.category}
                </Badge>
              ) : undefined
            }
            acoes={
              <Button
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => (saveScrollPosition(pathname), navigate(`/votacao-detalhes/${proposal.id}`))}
              >
                Responder
              </Button>
            }
            onClick={() => (saveScrollPosition(pathname), navigate(`/votacao-detalhes/${proposal.id}`))}
          />
        ))}
      </div>
    </CaixaOperacao>
  );
}
