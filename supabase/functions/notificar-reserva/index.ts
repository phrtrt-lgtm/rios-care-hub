// notificar-reserva — avisa o proprietário por WhatsApp de reserva confirmada.
// Chamada pelo trigger trg_notificar_reserva_whatsapp (sem token) ou por admin
// (botão "Enviar teste"). Sem admin, a function reconfere as mesmas condições
// do trigger (accepted, reservada há < 48 h, check-out não passou) e envia no
// máximo uma vez; reenvio só com admin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { exigirPapel } from "../_shared/auth-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const CENTRAL_URL = "https://gxsdefecwamziirfbzlk.supabase.co/functions/v1/notificar";
const TEMPLATE = "reserva_confirmada_proprietario";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const primeiroNome = (n?: string | null) => (n || "").trim().split(/\s+/)[0] || "Proprietário";
const dataBR = (iso: string) => { const [a, m, d] = String(iso).slice(0, 10).split("-"); return `${d}/${m}/${a}`; };
const hojeBR = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

function canal(c?: string | null) {
  const v = (c || "").trim().toLowerCase();
  if (!v || ["direct", "manual", "direct_booking", "hostex", "website", "booking_site", "offline"].includes(v)) return "contato direto";
  if (v.includes("airbnb")) return "Airbnb";
  if (v.includes("booking")) return "Booking.com";
  const t = v.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  let body: { reservation_code?: string; reenviar?: boolean } = {};
  try { body = await req.json(); } catch { return json({ error: "Corpo inválido." }, 400); }
  const codigo = String(body.reservation_code ?? "").trim();
  if (!codigo || codigo.length > 100) return json({ error: "reservation_code obrigatório." }, 400);

  let admin = false;
  if ((req.headers.get("authorization") ?? "").length > 0 && body.reenviar) {
    const { resposta } = await exigirPapel(req, ["admin"], corsHeaders);
    if (resposta) return resposta;
    admin = true;
  } else if (body.reenviar) {
    return json({ error: "Não autorizado." }, 401);
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: r } = await supabase
    .from("hostex_reservations")
    .select("reservation_code, property_id, status, booked_at, check_in_date, check_out_date, guests, channel_type, whatsapp_reserva_status")
    .eq("reservation_code", codigo).maybeSingle();
  if (!r) return json({ error: "Reserva não encontrada." }, 404);
  if (r.status !== "accepted") return json({ status: "ignorado", motivo: "não confirmada" });

  if (!admin) {
    const recente = r.booked_at && Date.parse(r.booked_at) >= Date.now() - 48 * 3600_000;
    if (!recente || !r.check_out_date || r.check_out_date < hojeBR()) return json({ status: "ignorado", motivo: "fora da janela" });
    if (r.whatsapp_reserva_status === "enviado") return json({ status: "ja_enviado" });
  }

  const gravar = (campos: Record<string, unknown>) =>
    supabase.from("hostex_reservations").update(campos).eq("reservation_code", codigo);

  if (!r.property_id) return json({ status: "ignorado", motivo: "imóvel não vinculado" });
  const { data: imovel } = await supabase
    .from("properties").select("name, owner_id, owner_phone, notificar_reservas_whatsapp")
    .eq("id", r.property_id).maybeSingle();
  if (!imovel?.notificar_reservas_whatsapp) {
    await gravar({ whatsapp_reserva_status: "desativado", whatsapp_reserva_erro: null });
    return json({ status: "desativado" });
  }
  const { data: dono } = await supabase.from("profiles").select("name, phone").eq("id", imovel.owner_id).maybeSingle();
  const tel = (imovel.owner_phone || dono?.phone || "").replace(/\D/g, "");
  if (tel.length < 10) {
    await gravar({ whatsapp_reserva_status: "sem_telefone", whatsapp_reserva_erro: "Sem WhatsApp cadastrado." });
    return json({ status: "sem_telefone" });
  }

  const chave = Deno.env.get("NOTIFICAR_KEY");
  let ok = false, messageId: string | null = null, erro: string | null = null;
  if (!chave) erro = "NOTIFICAR_KEY não configurada.";
  else {
    try {
      const resp = await fetch(CENTRAL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-rios-key": chave },
        body: JSON.stringify({
          template: TEMPLATE,
          params: [primeiroNome(dono?.name), imovel.name, canal(r.channel_type), dataBR(r.check_in_date), dataBR(r.check_out_date), String(r.guests ?? 1)],
          para: [tel],
        }),
      });
      const texto = await resp.text();
      let d: any = null; try { d = JSON.parse(texto); } catch { /* */ }
      const res = d?.resultados?.[0];
      if (resp.ok && res?.ok) { ok = true; messageId = res.id ?? null; }
      else { const e = res?.erro || d?.error || d?.erro || `HTTP ${resp.status}: ${texto.slice(0, 300)}`; erro = typeof e === "string" ? e : JSON.stringify(e); }
    } catch (e) { erro = `Falha de rede: ${(e as Error).message}`; }
  }

  if (ok) {
    await gravar({ whatsapp_reserva_status: "enviado", whatsapp_reserva_enviado_em: new Date().toISOString(), whatsapp_reserva_message_id: messageId, whatsapp_reserva_erro: null });
    return json({ status: "enviado", message_id: messageId });
  }
  await gravar({ whatsapp_reserva_status: "falhou", whatsapp_reserva_erro: erro });
  return json({ status: "falhou", erro });
});
