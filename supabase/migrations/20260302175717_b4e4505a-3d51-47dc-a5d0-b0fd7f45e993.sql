CREATE POLICY "maintenance_can_create_tickets"
ON public.tickets
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'maintenance'::app_role
  )
);