import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface PresenceUser {
  id: string;
  name: string;
}

/**
 * Lightweight realtime presence for chat dialogs: who is connected and who is typing.
 * `channelKey` should be unique per conversation (e.g. `charge-<id>`).
 */
export function useChatPresence(channelKey: string | null, enabled: boolean = true) {
  const { user, profile } = useAuth();
  const [typingUsers, setTypingUsers] = useState<PresenceUser[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!channelKey || !enabled || !user || !profile) {
      setTypingUsers([]);
      setOnlineUsers([]);
      return;
    }

    const channel = supabase.channel(`typing-${channelKey}`, {
      config: { presence: { key: user.id } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const typing: PresenceUser[] = [];
        const online: PresenceUser[] = [];

        Object.entries(state).forEach(([key, presences]) => {
          if (key === user.id || !Array.isArray(presences)) return;
          presences.forEach((presence: any) => {
            online.push({ id: key, name: presence.name || "Alguém" });
            if (presence.isTyping) {
              typing.push({ id: key, name: presence.name || "Alguém" });
            }
          });
        });

        setTypingUsers(typing);
        setOnlineUsers(online);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ name: profile.name, isTyping: false });
        }
      });

    channelRef.current = channel;

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [channelKey, enabled, user, profile]);

  const setTyping = useCallback(
    (isTyping: boolean) => {
      const channel = channelRef.current;
      if (!channel || !profile) return;
      channel.track({ name: profile.name, isTyping });

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (isTyping) {
        timeoutRef.current = setTimeout(() => {
          channel.track({ name: profile.name, isTyping: false });
        }, 3000);
      }
    },
    [profile],
  );

  return { typingUsers, onlineUsers, setTyping };
}
