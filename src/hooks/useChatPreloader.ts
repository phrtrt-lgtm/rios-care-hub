import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChatMessage, ChatAttachment } from "./useMaintenanceChat";
import { preloadMediaUrls } from "./useMediaCache";

// Global cache for preloaded messages
const messagesCache = new Map<string, ChatMessage[]>();
const mediaCache = new Map<string, ChatAttachment[]>();
const loadingPromises = new Map<string, Promise<void>>();

export function useChatPreloader(ticketIds: string[]) {
  const preloadedRef = useRef<Set<string>>(new Set());

  const preloadMessages = useCallback(async (ticketId: string) => {
    // Skip if already cached or loading
    if (messagesCache.has(ticketId) || loadingPromises.has(ticketId)) {
      return;
    }

    const loadPromise = (async () => {
      try {
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

        messagesCache.set(ticketId, messagesData as ChatMessage[]);

        // Collect and preload media
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

        mediaCache.set(ticketId, mediaItems);

        if (allUrls.length > 0) {
          preloadMediaUrls(allUrls);
        }
      } catch (error) {
        console.error(`Error preloading messages for ticket ${ticketId}:`, error);
      } finally {
        loadingPromises.delete(ticketId);
      }
    })();

    loadingPromises.set(ticketId, loadPromise);
    await loadPromise;
  }, []);

  // Preload all tickets in background
  useEffect(() => {
    const newTickets = ticketIds.filter(id => !preloadedRef.current.has(id));
    
    if (newTickets.length === 0) return;

    // Preload with staggered delays to avoid overwhelming the server
    newTickets.forEach((ticketId, index) => {
      preloadedRef.current.add(ticketId);
      setTimeout(() => {
        preloadMessages(ticketId);
      }, index * 100); // 100ms delay between each request
    });
  }, [ticketIds, preloadMessages]);

  return {
    getCachedMessages: (ticketId: string) => messagesCache.get(ticketId),
    getCachedMedia: (ticketId: string) => mediaCache.get(ticketId),
    isLoaded: (ticketId: string) => messagesCache.has(ticketId),
    invalidateCache: (ticketId: string) => {
      messagesCache.delete(ticketId);
      mediaCache.delete(ticketId);
      preloadedRef.current.delete(ticketId);
    },
  };
}

// Export cache getters for use in chat hook
export function getCachedMessages(ticketId: string): ChatMessage[] | undefined {
  return messagesCache.get(ticketId);
}

export function getCachedMedia(ticketId: string): ChatAttachment[] | undefined {
  return mediaCache.get(ticketId);
}

export function setCachedMessages(ticketId: string, messages: ChatMessage[], media: ChatAttachment[]) {
  messagesCache.set(ticketId, messages);
  mediaCache.set(ticketId, media);
}

export function invalidateTicketCache(ticketId: string) {
  messagesCache.delete(ticketId);
  mediaCache.delete(ticketId);
}
