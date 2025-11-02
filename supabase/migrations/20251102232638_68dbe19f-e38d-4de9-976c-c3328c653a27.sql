-- Allow admins and agents to create tickets for any owner
CREATE POLICY "admins_agents_can_create_tickets" ON public.tickets
  FOR INSERT 
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'agent')
    )
  );

-- Allow admins and agents to update any ticket
CREATE POLICY "admins_agents_can_update_tickets" ON public.tickets
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'agent')
    )
  );

-- Allow admins and agents to view all tickets
CREATE POLICY "admins_agents_can_view_tickets" ON public.tickets
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'agent')
    )
    OR owner_id = auth.uid()
  );