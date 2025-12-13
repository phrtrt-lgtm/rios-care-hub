-- Add RLS policy for maintenance role to access ticket_messages
CREATE POLICY "tm_maintenance_all"
ON public.ticket_messages
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'maintenance'::app_role) 
  AND EXISTS (
    SELECT 1 FROM tickets t 
    WHERE t.id = ticket_messages.ticket_id 
    AND t.ticket_type NOT IN ('bloqueio_data', 'financeiro', 'conversar_hospedes', 'duvida')
  )
)
WITH CHECK (
  has_role(auth.uid(), 'maintenance'::app_role)
  AND EXISTS (
    SELECT 1 FROM tickets t 
    WHERE t.id = ticket_messages.ticket_id 
    AND t.ticket_type NOT IN ('bloqueio_data', 'financeiro', 'conversar_hospedes', 'duvida')
  )
);