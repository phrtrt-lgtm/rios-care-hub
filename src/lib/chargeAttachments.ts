import { supabase } from "@/integrations/supabase/client";

export type GalleryAttachment = {
  id: string;
  file_url: string;
  file_name: string;
  file_type: string;
};

const resolveUrl = (raw: string) => {
  if (!raw) return raw;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  const { data } = supabase.storage.from("attachments").getPublicUrl(raw);
  return data.publicUrl;
};

/**
 * Carrega os anexos exibidos na galeria das manutenções/cobranças.
 * Usa charge_attachments e, quando a cobrança não tem anexos próprios,
 * cai para os anexos do ticket de manutenção que a originou
 * (ligados por ticket_id ou pelas mensagens do ticket).
 */
export async function fetchChargeGalleryAttachments(
  charges: Array<{ id: string; ticket_id?: string | null }>,
): Promise<Record<string, GalleryAttachment[]>> {
  const grouped: Record<string, GalleryAttachment[]> = {};
  const ids = charges.map((c) => c.id);
  if (ids.length === 0) return grouped;

  const { data: chargeAtt } = await supabase
    .from("charge_attachments")
    .select("id, charge_id, file_path, file_name, mime_type, mime_type_override, created_at")
    .in("charge_id", ids)
    .order("created_at", { ascending: true });

  (chargeAtt || []).forEach((a: any) => {
    const item: GalleryAttachment = {
      id: a.id,
      file_url: resolveUrl(a.file_path || ""),
      file_name: a.file_name || "",
      file_type: a.mime_type_override || a.mime_type || "",
    };
    if (!grouped[a.charge_id]) grouped[a.charge_id] = [];
    grouped[a.charge_id].push(item);
  });

  // Fallback: cobranças sem anexos próprios herdam os anexos do ticket
  const pending = charges.filter((c) => c.ticket_id && !grouped[c.id]?.length);
  if (pending.length === 0) return grouped;

  const ticketIds = Array.from(new Set(pending.map((c) => c.ticket_id as string)));

  const [{ data: directAtt }, { data: msgRows }] = await Promise.all([
    supabase
      .from("ticket_attachments" as any)
      .select("id, ticket_id, message_id, file_url, path, file_name, name, file_type, mime_type, created_at")
      .in("ticket_id", ticketIds)
      .order("created_at", { ascending: true }),
    supabase
      .from("ticket_messages" as any)
      .select("id, ticket_id")
      .in("ticket_id", ticketIds),
  ]);

  const messageTicket = new Map<string, string>();
  (msgRows || []).forEach((m: any) => messageTicket.set(m.id, m.ticket_id));

  let msgAtt: any[] = [];
  if (messageTicket.size > 0) {
    const { data } = await supabase
      .from("ticket_attachments" as any)
      .select("id, ticket_id, message_id, file_url, path, file_name, name, file_type, mime_type, created_at")
      .in("message_id", Array.from(messageTicket.keys()))
      .order("created_at", { ascending: true });
    msgAtt = data || [];
  }

  const byTicket = new Map<string, Map<string, GalleryAttachment>>();
  [...(directAtt || []), ...msgAtt].forEach((a: any) => {
    const ticketId = a.ticket_id || messageTicket.get(a.message_id);
    if (!ticketId) return;
    if (!byTicket.has(ticketId)) byTicket.set(ticketId, new Map());
    const bucket = byTicket.get(ticketId)!;
    if (bucket.has(a.id)) return;
    bucket.set(a.id, {
      id: a.id,
      file_url: resolveUrl(a.file_url || a.path || ""),
      file_name: a.file_name || a.name || "Anexo",
      file_type: a.file_type || a.mime_type || "",
    });
  });

  pending.forEach((c) => {
    const bucket = byTicket.get(c.ticket_id as string);
    if (bucket && bucket.size > 0) grouped[c.id] = Array.from(bucket.values());
  });

  return grouped;
}
