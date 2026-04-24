import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface MaintenanceUpdate {
  id: string;
  ticket_id: string | null;
  charge_id: string | null;
  author_id: string;
  body: string;
  attachments: any[];
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  author?: {
    id: string;
    name: string;
    photo_url: string | null;
    role: string;
  } | null;
}

interface UseMaintenanceUpdatesArgs {
  ticketId?: string | null;
  chargeId?: string | null;
  enabled?: boolean;
}

/**
 * Read-only timeline of team-published updates about a maintenance.
 * Owner sees these (no input). Team can post via useCreateMaintenanceUpdate.
 */
export function useMaintenanceUpdates({ ticketId, chargeId, enabled = true }: UseMaintenanceUpdatesArgs) {
  const queryClient = useQueryClient();
  const queryKey = ["maintenance-updates", { ticketId, chargeId }];

  const query = useQuery({
    queryKey,
    enabled: enabled && (!!ticketId || !!chargeId),
    queryFn: async (): Promise<MaintenanceUpdate[]> => {
      let q = supabase
        .from("maintenance_updates")
        .select(`
          id, ticket_id, charge_id, author_id, body, attachments,
          created_at, edited_at, deleted_at,
          author:profiles!maintenance_updates_author_id_fkey(id, name, photo_url, role)
        `)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

      if (ticketId) q = q.eq("ticket_id", ticketId);
      else if (chargeId) q = q.eq("charge_id", chargeId);

      const { data, error } = await q;
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  // Realtime subscription
  useEffect(() => {
    if (!ticketId && !chargeId) return;
    const filter = ticketId ? `ticket_id=eq.${ticketId}` : `charge_id=eq.${chargeId}`;
    const channel = supabase
      .channel(`maintenance-updates-${ticketId ?? chargeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "maintenance_updates", filter },
        () => {
          queryClient.invalidateQueries({ queryKey });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId, chargeId]);

  return query;
}

interface CreateUpdateInput {
  ticketId?: string | null;
  chargeId?: string | null;
  body: string;
  attachments?: any[];
}

export function useCreateMaintenanceUpdate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ ticketId, chargeId, body, attachments = [] }: CreateUpdateInput) => {
      const { data: userResp } = await supabase.auth.getUser();
      const userId = userResp.user?.id;
      if (!userId) throw new Error("Não autenticado");
      if (!ticketId && !chargeId) throw new Error("Manutenção inválida");

      const { error } = await supabase.from("maintenance_updates").insert({
        ticket_id: ticketId ?? null,
        charge_id: chargeId ?? null,
        author_id: userId,
        body: body.trim(),
        attachments,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({
        queryKey: ["maintenance-updates", { ticketId: vars.ticketId, chargeId: vars.chargeId }],
      });
      toast({ title: "Atualização publicada", description: "O proprietário foi notificado." });
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao publicar",
        description: err.message || "Tente novamente",
        variant: "destructive",
      });
    },
  });
}
