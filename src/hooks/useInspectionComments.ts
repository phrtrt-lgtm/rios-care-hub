import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface InspectionCommentRow {
  id: string;
  inspection_id: string;
  author_id: string;
  body: string;
  mentioned_user_ids: string[];
  attachments: any[];
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  author?: {
    id: string;
    name: string;
    photo_url: string | null;
    role: string;
  } | null;
}

export function useInspectionComments(inspectionId: string | null) {
  const [comments, setComments] = useState<InspectionCommentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchComments = useCallback(async () => {
    if (!inspectionId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("inspection_comments" as any)
      .select("*")
      .eq("inspection_id", inspectionId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching inspection comments", error);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as unknown as InspectionCommentRow[];
    const authorIds = Array.from(new Set(rows.map((r) => r.author_id)));
    let profilesMap = new Map<string, InspectionCommentRow["author"]>();

    if (authorIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, name, photo_url, role")
        .in("id", authorIds);
      (profs ?? []).forEach((p: any) => {
        profilesMap.set(p.id, {
          id: p.id,
          name: p.name,
          photo_url: p.photo_url,
          role: p.role,
        });
      });
    }

    setComments(
      rows.map((r) => ({ ...r, author: profilesMap.get(r.author_id) ?? null }))
    );
    setLoading(false);
  }, [inspectionId]);

  useEffect(() => {
    fetchComments();
    if (!inspectionId) return;

    if (channelRef.current) supabase.removeChannel(channelRef.current);
    const ch = supabase
      .channel(`inspection-comments-${inspectionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inspection_comments",
          filter: `inspection_id=eq.${inspectionId}`,
        },
        () => fetchComments()
      )
      .subscribe();
    channelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
    };
  }, [inspectionId, fetchComments]);

  const send = async (body: string, mentionedIds: string[]) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !inspectionId) return null;

    const { data, error } = await supabase
      .from("inspection_comments" as any)
      .insert({
        inspection_id: inspectionId,
        author_id: session.user.id,
        body,
        mentioned_user_ids: mentionedIds,
      })
      .select()
      .single();

    if (error) throw error;

    if (mentionedIds.length > 0) {
      // Fire and forget — notify mentioned users
      supabase.functions.invoke("notify-mentions", {
        body: {
          entity_type: "inspection",
          entity_id: inspectionId,
          comment_id: (data as any)?.id,
          mentioned_user_ids: mentionedIds,
          author_id: session.user.id,
          body,
        },
      }).catch((e) => console.warn("notify-mentions failed", e));
    }

    return data;
  };

  const edit = async (id: string, body: string, mentionedIds: string[]) => {
    const { error } = await supabase
      .from("inspection_comments" as any)
      .update({ body, mentioned_user_ids: mentionedIds, edited_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  };

  const remove = async (id: string) => {
    const { error } = await supabase
      .from("inspection_comments" as any)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  };

  return { comments, loading, send, edit, remove, refetch: fetchComments };
}
