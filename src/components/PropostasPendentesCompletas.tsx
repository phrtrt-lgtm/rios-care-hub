import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PropostaCompleta } from "./PropostaCompleta";
import { Vote } from "lucide-react";

export function PropostasPendentesCompletas() {
  const { user, profile } = useAuth();

  const { data: pendingProposals, isLoading, refetch } = useQuery({
    queryKey: ['pending-proposals-full', user?.id],
    queryFn: async () => {
      if (!user) return [];

      // Para owners, mostrar apenas suas propostas pendentes (não respondidas OU respondidas mas não pagas)
      const { data, error } = await supabase
        .from('proposals')
        .select(`
          id,
          title,
          amount_cents,
          payment_type,
          proposal_responses!inner (
            id,
            owner_id,
            selected_option_id,
            paid_at,
            payment_amount_cents
          ),
          proposal_options (
            id,
            requires_payment
          )
        `)
        .eq('status', 'active')
        .eq('proposal_responses.owner_id', user.id)
        .order('deadline', { ascending: true });
      
      if (error) throw error;
      
      // Filtrar para mostrar apenas:
      // 1. Propostas não respondidas (selected_option_id is null)
      // 2. OU propostas respondidas mas não pagas (quando opção selecionada requer pagamento)
      const filtered = (data || []).filter((p: any) => {
        const response = p.proposal_responses?.[0];
        if (!response) return false;
        
        // Não respondeu ainda
        if (!response.selected_option_id) return true;
        
        // Respondeu - verificar se a opção selecionada requer pagamento
        const selectedOption = p.proposal_options?.find((o: any) => o.id === response.selected_option_id);
        const optionRequiresPayment = selectedOption?.requires_payment === true;
        const hasPaymentConfig = p.payment_type === 'fixed' || p.payment_type === 'quantity' || p.payment_type === 'items';
        
        // Se a opção requer pagamento e ainda não pagou, mostrar
        if (optionRequiresPayment && hasPaymentConfig && !response.paid_at) return true;
        
        return false;
      });
      
      return filtered;
    },
    enabled: !!user && profile?.role === 'owner',
  });

  // Não mostrar para equipe
  if (profile?.role !== 'owner') {
    return null;
  }

  if (isLoading || !pendingProposals || pendingProposals.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 space-y-4">
      <div className="flex items-center gap-2 text-primary">
        <Vote className="h-5 w-5" />
        <h2 className="font-bold text-lg">
          Propostas Pendentes ({pendingProposals.length})
        </h2>
      </div>
      
      {pendingProposals.map((proposal: any) => (
        <PropostaCompleta 
          key={proposal.id} 
          proposalId={proposal.id}
          onResponded={() => refetch()}
        />
      ))}
    </div>
  );
}
