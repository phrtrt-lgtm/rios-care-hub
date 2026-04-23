import { useNavigate, useLocation } from "react-router-dom";
import { saveScrollPosition } from "@/lib/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, CheckCircle2, XCircle, Clock, Trash2, Vote } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { useAuth } from "@/hooks/useAuth";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useState } from "react";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";

export default function Votacoes() {
  useScrollRestoration();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const isTeam = profile?.role && ['admin', 'maintenance'].includes(profile.role);
  const isAdmin = profile?.role === 'admin';
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(proposals?.map(p => p.id) || []);
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, id]);
    } else {
      setSelectedIds(selectedIds.filter(sid => sid !== id));
    }
  };

  const handleDelete = async () => {
    // Only admins can delete
    if (profile?.role !== 'admin') {
      toast.error("Apenas administradores podem excluir propostas");
      return;
    }

    if (selectedIds.length === 0) return;
    
    if (!confirm(`Tem certeza que deseja excluir ${selectedIds.length} proposta(s)?`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('proposals')
        .delete()
        .in('id', selectedIds);

      if (error) throw error;

      toast.success(`${selectedIds.length} proposta(s) excluída(s) com sucesso`);
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
    } catch (error) {
      console.error('Error deleting proposals:', error);
      toast.error('Erro ao excluir propostas');
    } finally {
      setIsDeleting(false);
    }
  };

  const getStatusBadge = (proposal: any) => {
    if (proposal.status === 'expired') {
      return <Badge variant="secondary">Expirado</Badge>;
    }
    if (proposal.status === 'approved') {
      return <Badge className="bg-success">Aprovado</Badge>;
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
          <CheckCircle2 className="h-4 w-4 text-success" />
          {approved}
        </span>
        <span className="flex items-center gap-1">
          <XCircle className="h-4 w-4 text-destructive" />
          {rejected}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-4 w-4 text-warning" />
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
            <h1 className="text-3xl font-bold">Propostas</h1>
            <p className="text-muted-foreground mt-1">
              {isTeam 
                ? "Gerencie propostas coletivas e acompanhe respostas"
                : "Veja as propostas e registre sua resposta"}
            </p>
          </div>
          <div className="flex gap-2">
            {isAdmin && selectedIds.length > 0 && (
              <Button 
                variant="destructive" 
                onClick={handleDelete}
                disabled={isDeleting}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir ({selectedIds.length})
              </Button>
            )}
            {isTeam && (
              <Button onClick={() => navigate('/nova-proposta-votacao')}>
                <Plus className="mr-2 h-4 w-4" />
                Nova Proposta
              </Button>
            )}
          </div>
        </div>

        {isAdmin && proposals && proposals.length > 0 && (
          <div className="mb-4 flex items-center gap-2">
            <Checkbox
              id="select-all"
              checked={selectedIds.length === proposals.length}
              onCheckedChange={handleSelectAll}
            />
            <label htmlFor="select-all" className="text-sm cursor-pointer">
              Selecionar todas ({proposals.length})
            </label>
          </div>
        )}

        {isLoading ? (
          <SectionSkeleton rows={3} showHeader={false} />
        ) : proposals?.length === 0 ? (
          <EmptyState
            icon={<Vote className="h-6 w-6" />}
            title="Nenhuma proposta encontrada"
            description="As propostas de votação aparecerão aqui quando forem criadas."
          />
        ) : (
          <div className="grid gap-4">
            {proposals?.map((proposal) => (
              <Card
                key={proposal.id}
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('.checkbox-wrapper')) {
                    e.stopPropagation();
                    return;
                  }
                  (saveScrollPosition(pathname), navigate(`/votacao-detalhes/${proposal.id}`));
                }}
              >
                <CardHeader>
                  <div className="flex justify-between items-start gap-3">
                    {isAdmin && (
                      <div className="checkbox-wrapper pt-1" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.includes(proposal.id)}
                          onCheckedChange={(checked) => handleSelectOne(proposal.id, checked as boolean)}
                        />
                      </div>
                    )}
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