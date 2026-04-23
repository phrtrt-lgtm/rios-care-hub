import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MessageSquare, Send, Pencil, Trash2, Check, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { MentionInput, MentionableUser, extractMentionedIds } from "./MentionInput";
import { MentionText } from "./MentionText";
import { useInspectionComments, InspectionCommentRow } from "@/hooks/useInspectionComments";
import { cn } from "@/lib/utils";

interface Props {
  inspectionId: string;
}

const EDIT_WINDOW_MS = 15 * 60 * 1000;

export function InspectionCommentThread({ inspectionId }: Props) {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const { comments, loading, send, edit, remove } = useInspectionComments(inspectionId);
  const [users, setUsers] = useState<MentionableUser[]>([]);
  const [draft, setDraft] = useState("");
  const [draftMentions, setDraftMentions] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editMentions, setEditMentions] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc(
        "get_inspection_mentionable_users" as any,
        { _inspection_id: inspectionId }
      );
      if (!error && data) setUsers(data as MentionableUser[]);
    })();
  }, [inspectionId]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      await send(body, draftMentions);
      setDraft("");
      setDraftMentions([]);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao enviar comentário");
    } finally {
      setSending(false);
    }
  };

  const startEdit = (c: InspectionCommentRow) => {
    setEditingId(c.id);
    setEditDraft(c.body);
    setEditMentions(c.mentioned_user_ids ?? []);
  };

  const saveEdit = async (id: string) => {
    const body = editDraft.trim();
    if (!body) return;
    try {
      await edit(id, body, editMentions);
      setEditingId(null);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao editar");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este comentário?")) return;
    try {
      await remove(id);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao excluir");
    }
  };

  const canEdit = (c: InspectionCommentRow) =>
    c.author_id === user?.id &&
    !c.deleted_at &&
    Date.now() - new Date(c.created_at).getTime() < EDIT_WINDOW_MS;

  const canDelete = (c: InspectionCommentRow) =>
    !c.deleted_at && (c.author_id === user?.id || isAdmin);

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Comentários</h3>
          {comments.length > 0 && (
            <span className="text-xs text-muted-foreground">({comments.length})</span>
          )}
        </div>

        <div className="space-y-3">
          {loading && comments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Carregando…</p>
          ) : comments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhum comentário ainda. Seja o primeiro a comentar.
            </p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex gap-3">
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarImage src={c.author?.photo_url ?? undefined} />
                  <AvatarFallback className="text-xs">
                    {c.author?.name?.slice(0, 2).toUpperCase() ?? "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">
                      {c.author?.name ?? "Usuário"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(c.created_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                      {c.edited_at && " · editado"}
                    </span>
                    {!c.deleted_at && (
                      <div className="ml-auto flex items-center gap-1">
                        {canEdit(c) && editingId !== c.id && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => startEdit(c)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        )}
                        {canDelete(c) && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-destructive"
                            onClick={() => handleDelete(c.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {c.deleted_at ? (
                    <p className="text-sm italic text-muted-foreground mt-0.5">
                      [comentário excluído]
                    </p>
                  ) : editingId === c.id ? (
                    <div className="mt-2 space-y-2">
                      <MentionInput
                        value={editDraft}
                        onChange={(v, ids) => {
                          setEditDraft(v);
                          setEditMentions(ids);
                        }}
                        users={users}
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveEdit(c.id)}>
                          <Check className="h-3 w-3 mr-1" /> Salvar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                        >
                          <X className="h-3 w-3 mr-1" /> Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <MentionText body={c.body} className="mt-0.5" />
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t pt-3 space-y-2">
          <MentionInput
            value={draft}
            onChange={(v, ids) => {
              setDraft(v);
              setDraftMentions(ids);
            }}
            users={users}
            placeholder="Escreva um comentário… use @ para mencionar"
            rows={2}
            onSubmit={handleSend}
            disabled={sending}
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              Cmd/Ctrl + Enter para enviar
            </span>
            <Button
              size="sm"
              onClick={handleSend}
              disabled={!draft.trim() || sending}
            >
              <Send className="h-3 w-3 mr-1" /> Enviar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
