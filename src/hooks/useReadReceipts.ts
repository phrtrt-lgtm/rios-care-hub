import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface ReadReceipt {
  id: string;
  message_id: string;
  message_type: "ticket" | "charge";
  reader_id: string;
  read_at: string;
  reader?: {
    name: string;
    role: string;
  };
}

export function useReadReceipts(
  messageIds: string[],
  messageType: "ticket" | "charge"
) {
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<Record<string, ReadReceipt[]>>({});
  const [loading, setLoading] = useState(false);

  const fetchReceipts = useCallback(async () => {
    if (!user || messageIds.length === 0) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("message_read_receipts")
        .select(`
          id,
          message_id,
          message_type,
          reader_id,
          read_at,
          profiles:reader_id (
            name,
            role
          )
        `)
        .in("message_id", messageIds)
        .eq("message_type", messageType)
        .order("read_at", { ascending: true });

      if (error) throw error;

      // Group by message_id
      const grouped: Record<string, ReadReceipt[]> = {};
      (data || []).forEach((receipt: any) => {
        const messageId = receipt.message_id;
        if (!grouped[messageId]) {
          grouped[messageId] = [];
        }
        grouped[messageId].push({
          id: receipt.id,
          message_id: receipt.message_id,
          message_type: receipt.message_type,
          reader_id: receipt.reader_id,
          read_at: receipt.read_at,
          reader: receipt.profiles ? {
            name: receipt.profiles.name,
            role: receipt.profiles.role
          } : undefined
        });
      });

      setReceipts(grouped);
    } catch (error) {
      console.error("Error fetching read receipts:", error);
    } finally {
      setLoading(false);
    }
  }, [user, messageIds.join(","), messageType]);

  // Fetch on mount and when message IDs change
  useEffect(() => {
    fetchReceipts();
  }, [fetchReceipts]);

  // Mark messages as read
  const markAsRead = useCallback(async (messageIdsToMark: string[]) => {
    if (!user || messageIdsToMark.length === 0) return;

    try {
      // Filter out messages already read by this user
      const existingReadIds = Object.values(receipts)
        .flat()
        .filter(r => r.reader_id === user.id)
        .map(r => r.message_id);

      const newMessageIds = messageIdsToMark.filter(
        id => !existingReadIds.includes(id)
      );

      if (newMessageIds.length === 0) return;

      // Insert read receipts for new messages
      const receiptsToInsert = newMessageIds.map(messageId => ({
        message_id: messageId,
        message_type: messageType,
        reader_id: user.id
      }));

      const { error } = await supabase
        .from("message_read_receipts")
        .upsert(receiptsToInsert, { 
          onConflict: "message_id,reader_id",
          ignoreDuplicates: true 
        });

      if (error) throw error;

      // Refetch to get updated receipts
      fetchReceipts();
    } catch (error) {
      console.error("Error marking messages as read:", error);
    }
  }, [user, receipts, messageType, fetchReceipts]);

  return {
    receipts,
    loading,
    markAsRead,
    refetch: fetchReceipts
  };
}

// Helper to format read receipt display
export function formatReadReceipt(receipt: ReadReceipt): string {
  const date = new Date(receipt.read_at);
  const time = date.toLocaleTimeString("pt-BR", { 
    hour: "2-digit", 
    minute: "2-digit" 
  });
  const dateStr = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit"
  });
  
  const readerName = receipt.reader?.name || "Usuário";
  const isTeam = ["admin", "agent", "maintenance"].includes(receipt.reader?.role || "");
  const roleLabel = isTeam ? "Equipe" : "Proprietário";
  
  return `${readerName} (${roleLabel}) - ${dateStr} ${time}`;
}
