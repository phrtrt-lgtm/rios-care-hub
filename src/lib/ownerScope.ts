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
 * Filtro `.or()` para tabelas com owner_id + property_id:
 * registros do titular OU das unidades compartilhadas com ele.
 */
export async function ownerScopeFilter(userId: string): Promise<string> {
  const ids = await getSharedPropertyIds(userId);
  return ids.length
    ? `owner_id.eq.${userId},property_id.in.(${ids.join(",")})`
    : `owner_id.eq.${userId}`;
}

/** Mesmo escopo, para a tabela properties (coluna id). */
export async function propertiesScopeFilter(userId: string): Promise<string> {
  const ids = await getSharedPropertyIds(userId);
  return ids.length ? `owner_id.eq.${userId},id.in.(${ids.join(",")})` : `owner_id.eq.${userId}`;
}

