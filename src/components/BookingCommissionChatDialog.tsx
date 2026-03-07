import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Send, Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";

interface Message {
  id: string;
  body: string;
  author_id: string;
  is_internal: boolean;
  created_at: string;
  author?: { name: string; role: string };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commissionId: string | null;
  title: string;
}

export function BookingCommissionChatDialog({ open, onOpenChange, commissionId, title }: Props) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [body, setBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isTeam = ["admin", "agent", "maintenance"].includes(profile?.role || "");

  useEffect(() => {
    if (open && commissionId) {
      fetchMessages();
    } else {
      setMessages([]);
    }
  }, [open, commissionId]);

  useEffect(() => {
    if (!open || !commissionId) return;
    const channel = supabase
      .channel(`booking-commission-chat-${commissionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "booking_commission_messages",
          filter: `commission_id=eq.${commissionId}`,
        },
        () => fetchMessages()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open, commissionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchMessages = async () => {
    if (!commissionId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("booking_commission_messages")
        .select("*")
        .eq("commission_id", commissionId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const enriched = await Promise.all(
        (data || []).map(async (m) => {
          const { data: authorData } = await supabase
            .from("profiles")
            .select("name, role")
            .eq("id", m.author_id)
            .single();
          return { ...m, author: authorData || { name: "N/A", role: "unknown" } };
        })
      );
      setMessages(enriched);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!body.trim() || !commissionId || !profile) return;
    setSending(true);
    try {
      const { error } = await supabase.from("booking_commission_messages").insert({
        commission_id: commissionId,
        author_id: profile.id,
        body: body.trim(),
        is_internal: isTeam ? isInternal : false,
      });
      if (error) throw error;
      setBody("");
    } catch (err: any) {
      toast({ title: "Erro ao enviar mensagem", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const isOwnMessage = (msg: Message) => msg.author_id === profile?.id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg flex flex-col h-[80vh] p-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="truncate">{title}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Nenhuma mensagem ainda. Inicie a conversa.
            </div>
          ) : (
            messages.map((msg) => {
              const own = isOwnMessage(msg);
              return (
                <div key={msg.id} className={`flex flex-col ${own ? "items-end" : "items-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      msg.is_internal
                        ? "bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200 border border-yellow-300"
                        : own
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {!own && (
                      <p className="text-xs font-semibold mb-0.5 opacity-70">
                        {msg.author?.name}
                        {msg.is_internal && (
                          <Badge variant="outline" className="ml-1 text-[10px] py-0 px-1">interno</Badge>
                        )}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap">{msg.body}</p>
                    <p className="text-[10px] opacity-60 mt-1 text-right">{formatDate(msg.created_at)}</p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 pb-4 pt-2 border-t shrink-0 space-y-2">
          {isTeam && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsInternal(!isInternal)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  isInternal
                    ? "bg-yellow-100 text-yellow-800 border-yellow-300"
                    : "bg-muted text-muted-foreground border-muted-foreground/30"
                }`}
              >
                {isInternal ? "Nota Interna" : "Visível ao proprietário"}
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Digite uma mensagem..."
              rows={2}
              className="resize-none flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={sending || !body.trim()}
              className="self-end"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
