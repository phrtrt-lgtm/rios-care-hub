import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMaintenanceUpdates, useCreateMaintenanceUpdate } from "@/hooks/useMaintenanceUpdates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquareText, Send, Loader2, Lock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface MaintenanceUpdatesThreadProps {
  ticketId?: string | null;
  chargeId?: string | null;
}

/**
 * Timeline de acompanhamento da manutenção.
 * - Equipe: pode publicar atualizações (input visível).
 * - Proprietário: somente leitura (sem input).
 */
export function MaintenanceUpdatesThread({ ticketId, chargeId }: MaintenanceUpdatesThreadProps) {
  const { profile } = useAuth();
  const isTeam = profile?.role === "admin" || profile?.role === "agent" || profile?.role === "maintenance";

  const { data: updates, isLoading } = useMaintenanceUpdates({ ticketId, chargeId });
  const createMutation = useCreateMaintenanceUpdate();

  const [body, setBody] = useState("");

  const handleSubmit = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    await createMutation.mutateAsync({ ticketId, chargeId, body: trimmed });
    setBody("");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-primary" />
          Acompanhamento
          {!isTeam && (
            <Badge variant="outline" className="ml-auto text-[10px] gap-1">
              <Lock className="h-3 w-3" />
              Somente leitura
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : !updates || updates.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            {isTeam
              ? "Nenhuma atualização publicada ainda. Publique a primeira para o proprietário acompanhar."
              : "A equipe ainda não publicou atualizações sobre esta manutenção."}
          </div>
        ) : (
          <div className="space-y-4">
            {updates.map((u) => {
              const initials = (u.author?.name || "?")
                .split(" ")
                .map((s) => s[0])
                .slice(0, 2)
                .join("")
                .toUpperCase();
              return (
                <div key={u.id} className="flex gap-3">
                  <Avatar className="h-8 w-8 shrink-0">
                    {u.author?.photo_url && <AvatarImage src={u.author.photo_url} alt={u.author.name} />}
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-medium">{u.author?.name || "Equipe RIOS"}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                        Equipe
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(u.created_at), { addSuffix: true, locale: ptBR })}
                      </span>
                    </div>
                    <p className="text-sm mt-1 whitespace-pre-wrap break-words">{u.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {isTeam && (
          <div className="border-t pt-4 space-y-2">
            <Textarea
              placeholder="Publicar uma atualização para o proprietário acompanhar..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              className="resize-none"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!body.trim() || createMutation.isPending}
                className="gap-2"
              >
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Publicar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
