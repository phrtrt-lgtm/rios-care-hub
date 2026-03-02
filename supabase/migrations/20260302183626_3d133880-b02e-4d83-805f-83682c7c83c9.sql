CREATE POLICY "ta_maintenance_all"
ON public.ticket_attachments
FOR ALL
USING (
  has_role(auth.uid(), 'maintenance'::app_role)
  AND EXISTS (
    SELECT 1 FROM tickets t
    JOIN ticket_messages m ON m.ticket_id = t.id
    WHERE m.id = ticket_attachments.message_id
    AND t.ticket_type NOT IN ('bloqueio_data', 'financeiro', 'conversar_hospedes', 'duvida')
  )
)
WITH CHECK (
  has_role(auth.uid(), 'maintenance'::app_role)
  AND EXISTS (
    SELECT 1 FROM tickets t
    JOIN ticket_messages m ON m.ticket_id = t.id
    WHERE m.id = ticket_attachments.message_id
    AND t.ticket_type NOT IN ('bloqueio_data', 'financeiro', 'conversar_hospedes', 'duvida')
  )
);