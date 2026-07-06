
-- 1) hostex_reservations: restringir leitura
DROP POLICY IF EXISTS "auth read hostex_reservations" ON public.hostex_reservations;

CREATE POLICY "Team can read all hostex_reservations"
ON public.hostex_reservations
FOR SELECT
TO authenticated
USING (public.is_team_member(auth.uid()));

CREATE POLICY "Owners can read own hostex_reservations"
ON public.hostex_reservations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = hostex_reservations.property_id
      AND p.owner_id = auth.uid()
  )
);

-- 2) storage: charge-attachments delete/update ownership
DROP POLICY IF EXISTS "Authenticated users can delete charge attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update charge attachments" ON storage.objects;

CREATE POLICY "Owners or team can delete charge attachments"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'charge-attachments'
  AND (
    public.is_team_member(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.charge_attachments ca
      JOIN public.charges c ON c.id = ca.charge_id
      WHERE ca.file_path = storage.objects.name
        AND c.owner_id = auth.uid()
    )
  )
);

CREATE POLICY "Owners or team can update charge attachments"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'charge-attachments'
  AND (
    public.is_team_member(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.charge_attachments ca
      JOIN public.charges c ON c.id = ca.charge_id
      WHERE ca.file_path = storage.objects.name
        AND c.owner_id = auth.uid()
    )
  )
)
WITH CHECK (
  bucket_id = 'charge-attachments'
  AND (
    public.is_team_member(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.charge_attachments ca
      JOIN public.charges c ON c.id = ca.charge_id
      WHERE ca.file_path = storage.objects.name
        AND c.owner_id = auth.uid()
    )
  )
);

-- 3) ticket_messages / ticket_attachments: remover bypass via current_setting
DROP POLICY IF EXISTS "tm_admin_all" ON public.ticket_messages;
DROP POLICY IF EXISTS "tm_agent_all" ON public.ticket_messages;
DROP POLICY IF EXISTS "tm_owner_access" ON public.ticket_messages;

CREATE POLICY "tm_admin_all"
ON public.ticket_messages
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "tm_agent_all"
ON public.ticket_messages
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'agent'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'agent'::app_role));

CREATE POLICY "tm_owner_access"
ON public.ticket_messages
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = ticket_messages.ticket_id
      AND t.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = ticket_messages.ticket_id
      AND t.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "ta_admin_all" ON public.ticket_attachments;
DROP POLICY IF EXISTS "ta_agent_all" ON public.ticket_attachments;
DROP POLICY IF EXISTS "ta_owner_access" ON public.ticket_attachments;

CREATE POLICY "ta_admin_all"
ON public.ticket_attachments
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "ta_agent_all"
ON public.ticket_attachments
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'agent'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'agent'::app_role));

CREATE POLICY "ta_owner_access"
ON public.ticket_attachments
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.ticket_messages m
    JOIN public.tickets t ON t.id = m.ticket_id
    WHERE m.id = ticket_attachments.message_id
      AND t.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.ticket_messages m
    JOIN public.tickets t ON t.id = m.ticket_id
    WHERE m.id = ticket_attachments.message_id
      AND t.owner_id = auth.uid()
  )
);

-- 4) owner_curations: remover leitura pública anônima
DROP POLICY IF EXISTS "Public can view published or paid curations by id" ON public.owner_curations;
