import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Quem recebe o WhatsApp das listas (system_config 'listas_whatsapp',
 * migration 20261017180000) e a equipe que pode cuidar de uma tarefa de rua.
 */

export interface ConfigListas {
  ativo?: boolean;
  tarefas_rua_padrao?: string;
}

export function useConfigListas() {
  return useQuery({
    queryKey: ["config-listas-whatsapp"],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<ConfigListas> => {
      const { data, error } = await supabase.from("system_config").select("value").eq("key", "listas_whatsapp").maybeSingle();
      if (error) throw error;
      return ((data?.value ?? {}) as ConfigListas) || {};
    },
  });
}

export interface MembroEquipe {
  id: string;
  name: string;
  temTelefone: boolean;
}

/** Equipe (admin, agent, maintenance), quem tem WhatsApp primeiro. */
export function useEquipe() {
  return useQuery({
    queryKey: ["equipe-responsaveis"],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<MembroEquipe[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, phone, role")
        .in("role", ["admin", "agent", "maintenance"])
        .order("name");
      if (error) throw error;
      return (data ?? [])
        .map((p) => ({ id: p.id, name: p.name, temTelefone: !!(p.phone ?? "").replace(/\D/g, "") }))
        .sort((a, b) => Number(b.temTelefone) - Number(a.temTelefone));
    },
  });
}
