import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

export type Papel = "admin" | "agent" | "maintenance" | "owner" | "cleaner" | "pending_owner";

export interface Autor {
  id: string;
  role: Papel;
}

/**
 * Exige um usuário autenticado cujo papel esteja entre os permitidos.
 *
 * Usar em toda function que executa operação privilegiada. `verify_jwt = true`
 * no config.toml garante apenas que existe *algum* JWT válido — não diz nada
 * sobre quem é. Sem esta checagem, qualquer usuário logado do portal alcança
 * a operação.
 *
 * Devolve `{ autor }` quando passa, ou `{ resposta }` com o 401/403 pronto
 * para ser retornado direto pelo handler.
 */
export async function exigirPapel(
  req: Request,
  papeisPermitidos: Papel[],
  corsHeaders: Record<string, string>,
): Promise<{ autor?: Autor; resposta?: Response }> {
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) {
    return { resposta: json({ error: "Não autorizado." }, 401) };
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) {
    console.warn("[auth-guard] token invalido:", userError?.message);
    return { resposta: json({ error: "Não autenticado." }, 401) };
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || !papeisPermitidos.includes(profile.role as Papel)) {
    console.warn(
      `[auth-guard] acesso negado. user=${user.id} papel=${profile?.role ?? "sem perfil"} permitidos=${papeisPermitidos.join(",")}`,
    );
    return { resposta: json({ error: "Acesso negado." }, 403) };
  }

  return { autor: { id: user.id, role: profile.role as Papel } };
}
