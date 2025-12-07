import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface ChatMessage {
  id: string;
  body: string;
  created_at: string;
  is_internal: boolean;
  author: {
    id: string;
    name: string;
    photo_url: string | null;
    role: string;
  } | null;
}

export interface TypingUser {
  id: string;
  name: string;
}

export function useMaintenanceChat(ticketId: string | null) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    if (!ticketId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("ticket_messages")
        .select(`
          id,
          body,
          created_at,
          is_internal,
          author:profiles!ticket_messages_author_id_fkey(id, name, photo_url, role)
        `)
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages(data as unknown as ChatMessage[]);
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  // Setup realtime subscription
  useEffect(() => {
    if (!ticketId || !user) return;

    // Fetch initial messages
    fetchMessages();

    // Subscribe to new messages
    const channel = supabase
      .channel(`maintenance-chat-${ticketId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ticket_messages",
          filter: `ticket_id=eq.${ticketId}`,
        },
        async (payload) => {
          console.log("New message received:", payload);
          // Fetch the complete message with author info
          const { data: newMessage, error } = await supabase
            .from("ticket_messages")
            .select(`
              id,
              body,
              created_at,
              is_internal,
              author:profiles!ticket_messages_author_id_fkey(id, name, photo_url, role)
            `)
            .eq("id", payload.new.id)
            .single();

          if (!error && newMessage) {
            setMessages((prev) => {
              // Avoid duplicates
              if (prev.some((m) => m.id === newMessage.id)) return prev;
              return [...prev, newMessage as unknown as ChatMessage];
            });
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [ticketId, user, fetchMessages]);

  // Setup presence for typing indicator
  useEffect(() => {
    if (!ticketId || !user || !profile) return;

    const presenceChannel = supabase.channel(`typing-${ticketId}`, {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const typing: TypingUser[] = [];
        
        Object.entries(state).forEach(([key, presences]) => {
          if (key !== user.id && Array.isArray(presences)) {
            presences.forEach((presence: any) => {
              if (presence.isTyping) {
                typing.push({ id: key, name: presence.name || "Alguém" });
              }
            });
          }
        });
        
        setTypingUsers(typing);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            name: profile.name,
            isTyping: false,
          });
        }
      });

    // Store channel for typing updates
    const originalChannel = channelRef.current;
    channelRef.current = presenceChannel as any;

    return () => {
      presenceChannel.unsubscribe();
      channelRef.current = originalChannel;
    };
  }, [ticketId, user, profile]);

  // Send typing indicator
  const setTyping = useCallback(
    async (isTyping: boolean) => {
      if (!profile) return;
      
      const presenceChannel = supabase.channel(`typing-${ticketId}`);
      await presenceChannel.track({
        name: profile.name,
        isTyping,
      });

      // Auto-clear typing after 3 seconds
      if (isTyping) {
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        typingTimeoutRef.current = setTimeout(() => {
          presenceChannel.track({
            name: profile.name,
            isTyping: false,
          });
        }, 3000);
      }
    },
    [ticketId, profile]
  );

  // Send message
  const sendMessage = useCallback(
    async (body: string, isInternal: boolean = false) => {
      if (!ticketId || !user || !body.trim()) return false;

      setSending(true);
      try {
        const { error } = await supabase.from("ticket_messages").insert({
          ticket_id: ticketId,
          author_id: user.id,
          body: body.trim(),
          is_internal: isInternal,
        });

        if (error) throw error;

        // Clear typing indicator
        setTyping(false);
        
        return true;
      } catch (error) {
        console.error("Error sending message:", error);
        return false;
      } finally {
        setSending(false);
      }
    },
    [ticketId, user, setTyping]
  );

  return {
    messages,
    loading,
    sending,
    typingUsers,
    sendMessage,
    setTyping,
    refetch: fetchMessages,
  };
}
