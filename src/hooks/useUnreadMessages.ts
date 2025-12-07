import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

const STORAGE_KEY = "maintenance_chat_last_read";

interface LastReadMap {
  [ticketId: string]: string; // ISO timestamp
}

function getLastReadMap(): LastReadMap {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function setLastReadForTicket(ticketId: string) {
  try {
    const map = getLastReadMap();
    map[ticketId] = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore localStorage errors
  }
}

export function useUnreadMessages(ticketIds: string[]) {
  const { user } = useAuth();
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const fetchUnreadCounts = useCallback(async () => {
    if (!user || ticketIds.length === 0) return;

    setLoading(true);
    try {
      const lastReadMap = getLastReadMap();
      const counts: Record<string, number> = {};

      // Fetch message counts for all tickets
      for (const ticketId of ticketIds) {
        const lastRead = lastReadMap[ticketId];
        
        let query = supabase
          .from("ticket_messages")
          .select("id, created_at", { count: "exact", head: true })
          .eq("ticket_id", ticketId)
          .neq("author_id", user.id); // Don't count own messages

        if (lastRead) {
          query = query.gt("created_at", lastRead);
        }

        const { count, error } = await query;
        
        if (!error && count !== null) {
          counts[ticketId] = count;
        }
      }

      setUnreadCounts(counts);
    } catch (error) {
      console.error("Error fetching unread counts:", error);
    } finally {
      setLoading(false);
    }
  }, [user, ticketIds.join(",")]);

  // Fetch on mount and when ticket IDs change
  useEffect(() => {
    fetchUnreadCounts();
  }, [fetchUnreadCounts]);

  // Subscribe to realtime updates for new messages
  useEffect(() => {
    if (!user || ticketIds.length === 0) return;

    const channel = supabase
      .channel("unread-messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ticket_messages",
        },
        (payload) => {
          const newMessage = payload.new as any;
          // Only count if it's for one of our tickets and not from current user
          if (
            ticketIds.includes(newMessage.ticket_id) &&
            newMessage.author_id !== user.id
          ) {
            setUnreadCounts((prev) => ({
              ...prev,
              [newMessage.ticket_id]: (prev[newMessage.ticket_id] || 0) + 1,
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, ticketIds.join(",")]);

  // Mark a ticket as read
  const markAsRead = useCallback((ticketId: string) => {
    setLastReadForTicket(ticketId);
    setUnreadCounts((prev) => ({
      ...prev,
      [ticketId]: 0,
    }));
  }, []);

  return {
    unreadCounts,
    loading,
    markAsRead,
    refetch: fetchUnreadCounts,
  };
}
