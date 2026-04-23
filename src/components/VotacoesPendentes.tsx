import { useNavigate, useLocation } from "react-router-dom";
import { saveScrollPosition } from "@/lib/navigation";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Vote, Calendar } from "lucide-react";
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
    <Card className="mb-6 border-primary/20 bg-primary/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Vote className="h-5 w-5" />
              Propostas Pendentes
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Você tem {pendingProposals.length} {pendingProposals.length === 1 ? 'proposta pendente' : 'propostas pendentes'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/votacoes')}
          >
            Ver Todas
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {pendingProposals.slice(0, 3).map((proposal) => (
            <Card
              key={proposal.id}
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => (saveScrollPosition(pathname), navigate(`/votacao-detalhes/${proposal.id}`))}
            >
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold truncate">{proposal.title}</h4>
                    {proposal.category && (
                      <Badge variant="outline" className="mt-1">
                        {proposal.category}
                      </Badge>
                    )}
                    <div className="flex items-center gap-1 mt-2 text-sm text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      Prazo: {new Date(proposal.deadline).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                  <Button size="sm">
                    Responder
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
