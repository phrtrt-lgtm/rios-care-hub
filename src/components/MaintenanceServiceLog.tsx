import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { NotebookPen, Lock } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { MaintenanceNote } from "@/hooks/useMaintenances";

interface MaintenanceServiceLogProps {
  notes?: MaintenanceNote[] | null;
  /** Equipe vê também as notas internas. */
  isTeam?: boolean;
}

/**
 * Registro do serviço: preserva as descrições e comentários escritos
 * pela equipe no atendimento, mesmo depois de virar cobrança.
 */
export function MaintenanceServiceLog({ notes, isTeam = false }: MaintenanceServiceLogProps) {
  const visible = (notes || []).filter((n) => isTeam || !n.is_internal);
  if (visible.length === 0) return null;

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <NotebookPen className="h-4 w-4 text-primary" />
          Registro do serviço
          <span className="text-xs font-normal text-muted-foreground">({visible.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-1 space-y-3">
        {visible.map((note) => {
          const name = note.author?.name || "Equipe RIOS";
          const initials = name
            .split(" ")
            .map((s) => s[0])
            .slice(0, 2)
            .join("")
            .toUpperCase();
          return (
            <div key={note.id} className="flex gap-2.5">
              <Avatar className="h-7 w-7 shrink-0">
                {note.author?.photo_url && <AvatarImage src={note.author.photo_url} alt={name} />}
                <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-sm font-medium">{name}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(note.created_at)}</span>
                  {note.is_internal && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 gap-1">
                      <Lock className="h-2.5 w-2.5" />
                      Interno
                    </Badge>
                  )}
                </div>
                <p className="text-sm mt-0.5 whitespace-pre-wrap break-words">{note.body}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
