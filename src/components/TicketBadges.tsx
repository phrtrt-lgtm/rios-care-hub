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
        <Badge variant="outline" className="bg-info/10 text-info border-info/30">
          <Wrench className="h-3 w-3 mr-1" />
          Manutenção
        </Badge>
      )}
      
      {ticket.essential && (
        <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/30">
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
            ? "bg-destructive/10 text-destructive border-destructive/30" 
            : "bg-warning/10 text-warning border-warning/30"
          }
        >
          <Clock className="h-3 w-3 mr-1" />
          {overdue ? 'Prazo expirado' : `Decisão até ${dueDate.toLocaleDateString('pt-BR')}`}
        </Badge>
      )}
    </div>
  );
}
