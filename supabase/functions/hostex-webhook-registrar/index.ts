// hostex-webhook-registrar — (re)cria o webhook da Hostex apontando para a
// hostex-webhook e guarda o secret_token (devolvido só uma vez pelo
// POST /v3/webhooks) em integration_secrets. O valor nunca é devolvido nem logado.
// Só admin autenticado ou service role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { exigirPapel } from "../_shared/auth-guard.ts";
import { HOSTEX_BASE, conferirRespostaHostex } from "../_shared/hostexReserva.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ALVO = "https://ktzfovzwayfqczytmhno.supabase.co/functions/v1/hostex-webhook";
const ehNosso = (u: string) => /ktzfovzwayfqczytmhno\.supabase\.co\/functions\/v1\/hostex-webhook\/?(\?.*)?$/i.test(u.trim());

async function hx(method: string, path: string, apiKey: string, body?: unknown) {
  const resp = await fetch(`${HOSTEX_BASE}${path}`, {
    method,
    headers: { "Hostex-Access-Token": apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await resp.text();
  let d: any = null; try { d = JSON.parse(txt); } catch { /* */ }
  if (!resp.ok) throw new Error(`hostex_${resp.status} ${method} ${path}: ${(d?.error_msg ?? txt).toString().slice(0, 200)}`);
  return conferirRespostaHostex(d, path);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
  if (token !== serviceKey) {
    const { resposta } = await exigirPapel(req, ["admin"], corsHeaders);
    if (resposta) return resposta;
  }

  const apiKey = Deno.env.get("HOSTEX_API_KEY");
  if (!apiKey) return json({ error: "HOSTEX_API_KEY não configurada." }, 500);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  try {
    const lista = await hx("GET", "/webhooks", apiKey);
    const nossos = ((lista?.data?.webhooks ?? []) as any[]).filter((w) => ehNosso(String(w.url ?? "")));
    const todasUrls = ((lista?.data?.webhooks ?? []) as any[]).map((w) => ({ id: w.id, url: w.url, manageable: w.manageable }));
    let apagados = 0;
    const naoApagados: { id: unknown; erro: string }[] = [];
    for (const w of nossos) {
      try { await hx("DELETE", `/webhooks/${w.id}`, apiKey); apagados++; }
      catch (e) { naoApagados.push({ id: w.id, erro: (e as Error).message }); }
    }

    if (naoApagados.length) return json({ error: "Não consegui apagar todos os webhooks antigos.", encontrados: nossos.length, apagados, nao_apagados: naoApagados, webhooks: todasUrls }, 409);
    let criado: any;
    try { criado = await hx("POST", "/webhooks", apiKey, { url: ALVO, events: ["reservation_created", "reservation_updated"] }); }
    catch (e) { return json({ error: (e as Error).message, encontrados: nossos.length, apagados, webhooks: todasUrls }, 502); }
    const id = criado?.data?.id;
    const segredo = criado?.data?.secret_token;
    if (!segredo) return json({ error: "A Hostex não devolveu secret_token.", encontrados: nossos.length, apagados, webhook_id: id }, 502);

    const { error } = await supabase.from("integration_secrets")
      .upsert({ name: "hostex_webhook_secret", value: String(segredo), created_at: new Date().toISOString() }, { onConflict: "name" });
    if (error) return json({ error: `Webhook criado (id ${id}), mas falhou ao salvar o secret: ${error.message}` }, 500);

    return json({ ok: true, encontrados: nossos.length, apagados, nao_apagados: naoApagados, webhook_id: id, secret_salvo: true });
  } catch (e) {
    console.error("[hostex-webhook-registrar]", (e as Error).message);
    return json({ error: (e as Error).message }, 502);
  }
});
