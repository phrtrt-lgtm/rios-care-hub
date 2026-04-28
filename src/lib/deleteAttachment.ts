import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type AttachmentTable =
  | "ticket_attachments"
  | "charge_attachments"
  | "cleaning_inspection_attachments"
  | "booking_commission_attachments"
  | "alert_attachments"
  | "proposal_attachments"
  | "charge_message_attachments";

/**
 * Deletes an attachment row from one of the supported attachment tables.
 * Returns true on success. Shows a toast on error/success.
 */
export async function deleteAttachmentRow(
  table: AttachmentTable,
  attachmentId: string,
): Promise<boolean> {
  try {
    const { error } = await supabase.from(table).delete().eq("id", attachmentId);
    if (error) throw error;
    toast.success("Anexo excluído");
    return true;
  } catch (e: any) {
    console.error("[deleteAttachmentRow]", table, attachmentId, e);
    toast.error("Erro ao excluir anexo: " + (e?.message ?? "desconhecido"));
    return false;
  }
}
