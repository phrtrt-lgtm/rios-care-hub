DROP POLICY IF EXISTS "Owners can view their tickets" ON public.tickets;

CREATE POLICY "Owners can view their tickets"
ON public.tickets
FOR SELECT
USING (auth.uid() = owner_id);