import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { preloadMediaUrls } from "./useMediaCache";
import { getCachedMessages, getCachedMedia, setCachedMessages } from "./useChatPreloader";

export interface ChatAttachment {
  id: string;
  file_url: string;
  file_name?: string;
  file_type?: string;
  size_bytes?: number;
}

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
  attachments?: ChatAttachment[];
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
  const [allMediaItems, setAllMediaItems] = useState<ChatAttachment[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch messages with attachments
  const fetchMessages = useCallback(async (skipCache: boolean = false) => {
    if (!ticketId) return;
    
    // Check cache first for instant loading
    if (!skipCache) {
      const cachedMessages = getCachedMessages(ticketId);
      const cachedMedia = getCachedMedia(ticketId);
      if (cachedMessages) {
        setMessages(cachedMessages);
        setAllMediaItems(cachedMedia || []);
        setLoading(false);
        // Still fetch in background to get latest
        fetchMessages(true);
        return;
      }
    }
    
    setLoading(prev => skipCache ? prev : true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Use the edge function to get messages with attachments
      const { data, error } = await supabase.functions.invoke('get-ticket-messages', {
        body: { ticketId }
      });

      if (error) throw error;
      
      const messagesData = (data || []).map((msg: any) => ({
        id: msg.id,
        body: msg.body,
        created_at: msg.created_at,
        is_internal: msg.is_internal,
        author: msg.profiles ? {
          id: msg.author_id,
          name: msg.profiles.name,
          photo_url: msg.profiles.photo_url,
          role: msg.profiles.role,
        } : null,
        attachments: msg.attachments || [],
      }));
      setMessages(messagesData as ChatMessage[]);
      
      // Collect all media items for gallery and preload
      const mediaItems: ChatAttachment[] = [];
      const allUrls: string[] = [];
      
      messagesData.forEach((msg: any) => {
        msg.attachments?.forEach((att: any) => {
          allUrls.push(att.file_url);
          if (att.file_type?.startsWith('image/') || att.file_type?.startsWith('video/')) {
            mediaItems.push(att);
          }
        });
      });
      
      setAllMediaItems(mediaItems);
      
      // Update cache
      setCachedMessages(ticketId, messagesData as ChatMessage[], mediaItems);
      
      // Preload all media URLs for faster display
      if (allUrls.length > 0) {
        preloadMediaUrls(allUrls);
      }
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
        async () => {
          console.log("New message received, refetching...");
          // Refetch to get complete message with attachments
          await fetchMessages();
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

  // Send message with attachments - OPTIMISTIC UPDATE
  const sendMessage = useCallback(
    async (
      body: string, 
      attachments: Array<{ file_url: string; file_name: string; file_type: string; size_bytes: number; path: string }> = [],
      isInternal: boolean = false
    ) => {
      if (!ticketId || !user || !profile) return false;
      if (!body.trim() && attachments.length === 0) return false;

      // Create optimistic message immediately
      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticMessage: ChatMessage = {
        id: optimisticId,
        body: body.trim(),
        created_at: new Date().toISOString(),
        is_internal: isInternal,
        author: {
          id: user.id,
          name: profile.name,
          photo_url: profile.photo_url,
          role: profile.role,
        },
        attachments: attachments.map((att, i) => ({
          id: `optimistic-att-${i}`,
          file_url: att.file_url,
          file_name: att.file_name,
          file_type: att.file_type,
          size_bytes: att.size_bytes,
        })),
      };

      // Add optimistic message immediately - user sees it instantly
      setMessages(prev => [...prev, optimisticMessage]);
      
      // Clear typing indicator
      setTyping(false);

      // Send in background - no await blocking UI
      (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error('Not authenticated');

          const { error } = await supabase.functions.invoke(`create-ticket-message/${ticketId}`, {
            headers: {
              Authorization: `Bearer ${session.access_token}`
            },
            body: {
              message: body.trim() || null,
              attachments,
              is_internal: isInternal
            }
          });

          if (error) {
            console.error("Error sending message:", error);
            // Remove optimistic message on error
            setMessages(prev => prev.filter(m => m.id !== optimisticId));
          }
          // Realtime subscription will handle adding the real message
        } catch (error) {
          console.error("Error sending message:", error);
          // Remove optimistic message on error
          setMessages(prev => prev.filter(m => m.id !== optimisticId));
        }
      })();
      
      return true;
    },
    [ticketId, user, profile, setTyping]
  );

  return {
    messages,
    loading,
    sending,
    typingUsers,
    allMediaItems,
    sendMessage,
    setTyping,
    refetch: fetchMessages,
  };
}
