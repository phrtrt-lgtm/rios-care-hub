import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, Send, Sparkles } from "lucide-react";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CuradoriaMessage {
  id: string;
  owner_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author_name?: string;
  author_role?: string;
  author_photo?: string | null;
}

const TEAM_ROLES = ["admin", "agent", "maintenance"];

export function CuradoriaChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<CuradoriaMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const ownerId = user?.id;

  const fetchProfiles = async (ids: string[]) => {
    if (ids.length === 0) return new Map();
    const { data } = await supabase
      .from("profiles")
      .select("id, name, role, photo_url")
      .in("id", ids);
    return new Map((data ?? []).map((p) => [p.id, p]));
  };

  const loadMessages = async () => {
    if (!ownerId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("curadoria_messages")
      .select("*")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Não foi possível carregar o chat.");
      setLoading(false);
      return;
    }

    const authorIds = Array.from(new Set((data ?? []).map((m) => m.author_id)));
    const profiles = await fetchProfiles(authorIds);

    const enriched = (data ?? []).map((m) => {
      const p = profiles.get(m.author_id);
      return {
        ...m,
        author_name: p?.name ?? "Usuário",
        author_role: p?.role ?? "owner",
        author_photo: p?.photo_url ?? null,
      } as CuradoriaMessage;
    });

    setMessages(enriched);
    setLoading(false);
  };

  useEffect(() => {
    loadMessages();
    if (!ownerId) return;

    const channel = supabase
      .channel(`curadoria-${ownerId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "curadoria_messages",
          filter: `owner_id=eq.${ownerId}`,
        },
        async (payload) => {
          const m = payload.new as CuradoriaMessage;
          const profiles = await fetchProfiles([m.author_id]);
          const p = profiles.get(m.author_id);
          setMessages((prev) =>
            prev.some((x) => x.id === m.id)
              ? prev
              : [
                  ...prev,
                  {
                    ...m,
                    author_name: p?.name ?? "Usuário",
                    author_role: p?.role ?? "owner",
                    author_photo: p?.photo_url ?? null,
                  },
                ],
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const handleSend = async () => {
    if (!ownerId || !body.trim() || sending) return;
    setSending(true);
    const { error } = await supabase.from("curadoria_messages").insert({
      owner_id: ownerId,
      author_id: ownerId,
      body: body.trim(),
    });
    if (error) {
      toast.error("Não foi possível enviar a mensagem.");
    } else {
      setBody("");
    }
    setSending(false);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-primary" />
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
          Conversa com a curadoria
        </p>
      </div>

      <div
        ref={scrollRef}
        className="mb-3 max-h-72 min-h-[180px] flex-1 overflow-y-auto rounded-2xl border border-border bg-card p-3 shadow-sm"
      >
        {loading ? (
          <SectionSkeleton />
        ) : messages.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-5 w-5" />}
            title="Comece a conversa"
            description="Envie uma mensagem pra equipe de curadoria. Aqui ficam os avisos de compras, entregas e ajustes do plano."
          />
        ) : (
          <ul className="space-y-2.5">
            {messages.map((m) => {
              const isMine = m.author_id === ownerId;
              const isTeam = TEAM_ROLES.includes(m.author_role ?? "");
              return (
                <li
                  key={m.id}
                  className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[78%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed shadow-sm ${
                      isMine
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    <div className="mb-0.5 flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold opacity-90">
                        {isMine ? "Você" : m.author_name}
                      </span>
                      {isTeam && !isMine && (
                        <span className="rounded-full bg-primary/15 px-1.5 py-px text-[8px] font-bold uppercase tracking-wider text-primary">
                          RIOS
                        </span>
                      )}
                      <span
                        className={`text-[9px] ${
                          isMine ? "text-primary-foreground/70" : "text-muted-foreground"
                        }`}
                      >
                        {formatDistanceToNow(new Date(m.created_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-end gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Escreva sua mensagem… (Enter para enviar)"
          rows={2}
          className="min-h-[52px] resize-none border-border bg-background text-[12px]"
          disabled={!ownerId || sending}
        />
        <Button
          type="button"
          size="icon"
          onClick={handleSend}
          disabled={!ownerId || !body.trim() || sending}
          className="h-[52px] w-[52px] shrink-0 rounded-xl"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
