-- Allow maintenance role to update maintenance tickets (including status changes)
DROP POLICY IF EXISTS "maintenance_can_update_tickets" ON public.tickets;

CREATE POLICY "maintenance_can_update_tickets"
ON public.tickets
FOR UPDATE
USING (
  has_role(auth.uid(), 'maintenance'::app_role)
  AND ticket_type = 'manutencao'
);
