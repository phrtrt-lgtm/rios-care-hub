import { useState } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Clock, AlertTriangle, CheckCircle2 } from "lucide-react";

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
      <div className={`p-4 border rounded-xl ${
        ticket.owner_decision === 'owner_will_fix' 
          ? 'bg-blue-50 border-blue-200' 
          : 'bg-green-50 border-green-200'
      }`}>
        <div className="flex items-start gap-3">
          <CheckCircle2 className={`h-5 w-5 mt-0.5 ${
            ticket.owner_decision === 'owner_will_fix' ? 'text-blue-600' : 'text-green-600'
          }`} />
          <div>
            <p className="font-medium">
              {ticket.owner_decision === 'owner_will_fix' 
                ? '🔧 Você assumiu a execução' 
                : '👥 Delegado à gestão'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {ticket.owner_decision === 'owner_will_fix' 
                ? 'Você indicou que contratará ou executará esta manutenção por conta própria.'
                : 'A gestão cuidará de tudo. Você pode acompanhar o andamento por aqui.'}
            </p>
          </div>
        </div>
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

      // Notify team about the decision
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      fetch(`${supabaseUrl}/functions/v1/notify-owner-decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
        },
        body: JSON.stringify({
          type: 'decision_made',
          ticketId: ticket.id,
          decision,
        }),
      }).catch(err => console.error('Failed to notify team:', err));

      toast.success(decision === 'owner_will_fix' 
        ? 'Você assumiu a execução da manutenção' 
        : 'Manutenção delegada à gestão. Cuidaremos de tudo!'
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
      <div className="flex items-start gap-3 mb-4">
        {overdue ? (
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
        ) : (
          <Clock className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1">
          <p className="font-medium">
            {overdue ? '⚠️ Prazo expirado' : '⏰ Aguardando sua decisão'}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {dueDate && (
              <>
                Prazo: <strong>{dueDate.toLocaleString('pt-BR', { 
                  dateStyle: 'short', 
                  timeStyle: 'short' 
                })}</strong>
              </>
            )}
          </p>
          <p className="text-sm mt-2">
            Como você gostaria de proceder com esta manutenção?
          </p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Button 
          variant="outline" 
          disabled={loading} 
          onClick={() => handleDecision('owner_will_fix')}
          className="h-auto py-3 flex-col items-start text-left"
        >
          <span className="font-medium">🔧 Assumir execução</span>
          <span className="text-xs text-muted-foreground font-normal mt-1">
            Você contratará ou executará por conta própria
          </span>
        </Button>
        <Button 
          disabled={loading} 
          onClick={() => handleDecision('pm_will_fix')}
          className="h-auto py-3 flex-col items-start text-left"
        >
          <span className="font-medium">👥 Delegar à gestão</span>
          <span className="text-xs text-muted-foreground font-normal mt-1">
            Nós cuidaremos, com possibilidade de aporte
          </span>
        </Button>
      </div>
      
      {overdue && (
        <p className="text-xs text-red-600 mt-3">
          ⚠️ Prazo expirado. A gestão poderá executar para evitar prejuízos operacionais.
        </p>
      )}
    </div>
  );
}
