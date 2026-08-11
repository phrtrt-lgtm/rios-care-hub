import { supabase } from "@/integrations/supabase/client";

/**
 * IDs das propriedades que o usuário acompanha como acesso adicional
 * (co-proprietário), além das que ele é titular.
 * Cacheado por sessão para não repetir a consulta em cada tela.
 */
let cache: { userId: string; ids: string[] } | null = null;

export async function getSharedPropertyIds(userId: string): Promise<string[]> {
  if (cache && cache.userId === userId) return cache.ids;
  const { data, error } = await supabase
    .from("property_members")
    .select("property_id")
    .eq("user_id", userId);
  const ids = error ? [] : (data ?? []).map((r) => r.property_id as string);
  cache = { userId, ids };
  return ids;
}

export function clearSharedPropertyCache() {
  cache = null;
}

/**
 * Aplica o escopo do proprietário a uma query que tenha owner_id e property_id:
 * registros do titular OU das unidades compartilhadas com ele.
 */
export function applyOwnerScope<T>(query: T, userId: string, sharedIds: string[]): T {
  const q = query as any;
  if (!sharedIds.length) return q.eq("owner_id", userId);
  return q.or(`owner_id.eq.${userId},property_id.in.(${sharedIds.join(",")})`);
}
