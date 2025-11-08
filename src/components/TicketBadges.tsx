import { Badge } from "@/components/ui/badge";
import { AlertCircle, Clock, Wrench } from "lucide-react";

interface Ticket {
  kind?: string;
  essential?: boolean;
  owner_decision?: string | null;
  owner_action_due_at?: string | null;
}

export function TicketBadges({ ticket }: { ticket: Ticket }) {
  const dueDate = ticket.owner_action_due_at ? new Date(ticket.owner_action_due_at) : null;
  const now = new Date();
  const overdue = dueDate && dueDate < now;

  return (
    <div className="flex gap-2 flex-wrap">
      {ticket.kind === 'maintenance' && (
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
          <Wrench className="h-3 w-3 mr-1" />
          Manutenção
        </Badge>
      )}
      
      {ticket.essential && (
        <Badge variant="destructive" className="bg-red-100 text-red-700 border-red-200">
          <AlertCircle className="h-3 w-3 mr-1" />
          Essencial
        </Badge>
      )}
      
      {!ticket.essential && 
       ticket.kind === 'maintenance' && 
       !ticket.owner_decision && 
       dueDate && (
        <Badge 
          variant={overdue ? "destructive" : "outline"} 
          className={overdue 
            ? "bg-red-100 text-red-700 border-red-200" 
            : "bg-amber-50 text-amber-700 border-amber-200"
          }
        >
          <Clock className="h-3 w-3 mr-1" />
          {overdue ? 'Prazo expirado' : `Decisão até ${dueDate.toLocaleDateString('pt-BR')}`}
        </Badge>
      )}
    </div>
  );
}
