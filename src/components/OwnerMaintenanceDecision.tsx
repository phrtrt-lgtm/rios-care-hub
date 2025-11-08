import { useState } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Clock, AlertTriangle } from "lucide-react";

interface Ticket {
  id: string;
  kind: string;
  essential: boolean;
  owner_decision: string | null;
  owner_action_due_at: string | null;
  status: string;
}

export default function OwnerMaintenanceDecision({ ticket, onUpdate }: { ticket: Ticket; onUpdate?: () => void }) {
  const [loading, setLoading] = useState(false);

  if (ticket.kind !== 'maintenance' || ticket.essential) return null;
  
  if (ticket.owner_decision) {
    return (
      <div className="p-3 border rounded-xl bg-muted">
        <p className="text-sm text-muted-foreground">
          Decisão registrada: <b>{ticket.owner_decision === 'owner_will_fix' ? 'Proprietário executará' : 'Gestão executará'}</b>
        </p>
      </div>
    );
  }

  const now = new Date();
  const dueDate = ticket.owner_action_due_at ? new Date(ticket.owner_action_due_at) : null;
  const overdue = dueDate && dueDate < now;

  const handleDecision = async (decision: 'owner_will_fix' | 'pm_will_fix') => {
    setLoading(true);
    try {
      const newStatus = decision === 'pm_will_fix' ? 'em_andamento' : 'aguardando_proprietario';
      
      const { error } = await supabase
        .from('tickets')
        .update({
          owner_decision: decision,
          status: newStatus as any
        })
        .eq('id', ticket.id);

      if (error) throw error;

      toast.success(decision === 'owner_will_fix' 
        ? 'Você assumiu a execução da manutenção' 
        : 'Manutenção delegada à gestão'
      );
      
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error updating decision:', error);
      toast.error('Erro ao registrar decisão');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`p-4 border rounded-xl ${overdue ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-300'}`}>
      <div className="flex items-start gap-2 mb-3">
        {overdue ? (
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
        ) : (
          <Clock className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1">
          <p className="text-sm font-medium mb-1">
            {overdue ? 'Prazo expirado' : 'Aguardando sua decisão'}
          </p>
          <p className="text-sm text-muted-foreground">
            {dueDate && (
              <>
                Prazo: <b>{dueDate.toLocaleString('pt-BR', { 
                  dateStyle: 'short', 
                  timeStyle: 'short' 
                })}</b>
              </>
            )}
          </p>
        </div>
      </div>
      
      <div className="flex gap-2">
        <Button 
          variant="outline" 
          disabled={loading} 
          onClick={() => handleDecision('owner_will_fix')}
          className="flex-1"
        >
          Assumir execução
        </Button>
        <Button 
          disabled={loading} 
          onClick={() => handleDecision('pm_will_fix')}
          className="flex-1"
        >
          Delegar à gestão
        </Button>
      </div>
      
      {overdue && (
        <p className="text-xs text-red-600 mt-2">
          Prazo expirado. A gestão poderá executar para evitar prejuízos operacionais.
        </p>
      )}
    </div>
  );
}
