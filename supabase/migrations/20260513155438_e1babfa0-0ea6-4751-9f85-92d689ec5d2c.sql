DROP POLICY IF EXISTS "Owners can view their tickets" ON public.tickets;

CREATE POLICY "Owners can view their tickets"
ON public.tickets
FOR SELECT
USING (
  auth.uid() = owner_id
  AND (
    ticket_type <> 'manutencao'::ticket_type
    OR COALESCE(cost_responsible, 'owner') = 'owner'
    OR status IN ('concluido'::ticket_status, 'cancelado'::ticket_status)
  )
);