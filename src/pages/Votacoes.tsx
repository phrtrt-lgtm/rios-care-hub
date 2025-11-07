import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, CheckCircle2, XCircle, Clock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function Votacoes() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isTeam = profile?.role && ['admin', 'maintenance'].includes(profile.role);

  const { data: proposals, isLoading } = useQuery({
    queryKey: ['proposals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select(`
          *,
          proposal_responses (
            id,
            approved,
            owner_id
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const getStatusBadge = (proposal: any) => {
    if (proposal.status === 'expired') {
      return <Badge variant="secondary">Expirado</Badge>;
    }
    if (proposal.status === 'approved') {
      return <Badge className="bg-green-600">Aprovado</Badge>;
    }
    if (proposal.status === 'rejected') {
      return <Badge variant="destructive">Rejeitado</Badge>;
    }

    const responses = proposal.proposal_responses || [];
    const approved = responses.filter((r: any) => r.approved === true).length;
    const rejected = responses.filter((r: any) => r.approved === false).length;
    const pending = responses.filter((r: any) => r.approved === null).length;

    return (
      <div className="flex gap-2 items-center text-sm">
        <span className="flex items-center gap-1">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          {approved}
        </span>
        <span className="flex items-center gap-1">
          <XCircle className="h-4 w-4 text-red-600" />
          {rejected}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-4 w-4 text-yellow-600" />
          {pending}
        </span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Propostas e Votações</h1>
            <p className="text-muted-foreground mt-1">
              {isTeam 
                ? "Gerencie propostas coletivas e acompanhe votações"
                : "Veja as propostas e registre sua aprovação ou rejeição"}
            </p>
          </div>
          {isTeam && (
            <Button onClick={() => navigate('/nova-proposta-votacao')}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Proposta
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="text-center py-12">Carregando...</div>
        ) : proposals?.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Nenhuma proposta encontrada</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {proposals?.map((proposal) => (
              <Card
                key={proposal.id}
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => navigate(`/votacao-detalhes/${proposal.id}`)}
              >
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <CardTitle className="text-xl">{proposal.title}</CardTitle>
                      {proposal.category && (
                        <Badge variant="outline" className="mt-2">
                          {proposal.category}
                        </Badge>
                      )}
                    </div>
                    {getStatusBadge(proposal)}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4 line-clamp-2">
                    {proposal.description}
                  </p>
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    {proposal.amount_cents && (
                      <span>
                        Valor: <strong>R$ {(proposal.amount_cents / 100).toFixed(2)}</strong>
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      Prazo: {new Date(proposal.deadline).toLocaleDateString('pt-BR')}
                    </span>
                    <span>
                      Respostas: {proposal.proposal_responses?.length || 0}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}