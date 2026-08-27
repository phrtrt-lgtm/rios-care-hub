import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Send, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useChatPresence } from "@/hooks/useChatPresence";
import { ChatDialogHeader } from "@/components/chat/ChatDialogHeader";
import { ChatMessageBubble } from "@/components/chat/ChatMessageBubble";
import { ChatDateDivider } from "@/components/chat/ChatDateDivider";
import { ChatTypingIndicator } from "@/components/chat/ChatTypingIndicator";
import { ChatEmptyState } from "@/components/chat/ChatEmptyState";


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

  const { typingUsers, onlineUsers, setTyping } = useChatPresence(
    commissionId ? `booking-commission-${commissionId}` : null,
    open,
  );


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

  const grouped = messages.reduce((groups, message) => {
    const date = message.created_at.slice(0, 10);
    if (!groups[date]) groups[date] = [];
    groups[date].push(message);
    return groups;
  }, {} as Record<string, Message[]>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg flex flex-col h-[80vh] p-0 gap-0 overflow-hidden rounded-2xl">
        <ChatDialogHeader title={title} live={onlineUsers.length > 0} />

        {/* Messages */}
        <div className="flex-1 overflow-y-auto bg-muted/20 px-3 py-1">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <ChatEmptyState description="Inicie a conversa sobre esta comissão — as mensagens chegam em tempo real." />
          ) : (
            Object.entries(grouped).map(([date, dayMessages]) => (
              <div key={date}>
                <ChatDateDivider date={date} />
                {dayMessages.map((msg, i) => {
                  const prev = dayMessages[i - 1];
                  const isGrouped =
                    !!prev &&
                    prev.author_id === msg.author_id &&
                    new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() <
                      5 * 60 * 1000;
                  return (
                    <ChatMessageBubble
                      key={msg.id}
                      authorName={msg.author?.name}
                      authorRole={msg.author?.role}
                      createdAt={msg.created_at}
                      isOwn={isOwnMessage(msg)}
                      isInternal={msg.is_internal}
                      grouped={isGrouped}
                      body={msg.body}
                    />
                  );
                })}
              </div>
            ))
          )}
          <ChatTypingIndicator names={typingUsers.map((u) => u.name)} />
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
                    ? "bg-warning/10 text-warning border-warning/30"
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
              onChange={(e) => {
                setBody(e.target.value);
                setTyping(e.target.value.length > 0);
              }}
              onBlur={() => setTyping(false)}
              placeholder="Digite uma mensagem..."
              rows={2}
              className="resize-none flex-1 rounded-xl"
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
              className="self-end rounded-xl"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
