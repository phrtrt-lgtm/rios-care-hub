-- 1) Tabela de acessos adicionais por propriedade
CREATE TABLE IF NOT EXISTS public.property_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  invited_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, user_id)
);

GRANT SELECT ON public.property_members TO authenticated;
GRANT ALL ON public.property_members TO service_role;

ALTER TABLE public.property_members ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_property_members_updated_at
BEFORE UPDATE ON public.property_members
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Função de acesso (titular OU convidado OU equipe)
CREATE OR REPLACE FUNCTION public.has_property_access(_user_id uuid, _property_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _property_id IS NOT NULL AND _user_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.properties p WHERE p.id = _property_id AND p.owner_id = _user_id)
    OR EXISTS (SELECT 1 FROM public.property_members m WHERE m.property_id = _property_id AND m.user_id = _user_id)
  )
$$;

-- Políticas da própria tabela de acessos
CREATE POLICY "Team can manage property members"
  ON public.property_members FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid()))
  WITH CHECK (public.is_team_member(auth.uid()));

CREATE POLICY "Members and owner can view property members"
  ON public.property_members FOR SELECT TO authenticated
  USING (public.has_property_access(auth.uid(), property_id));

-- 3) Acesso ao imóvel
CREATE POLICY "Members can view shared properties"
  ON public.properties FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.property_members m WHERE m.property_id = properties.id AND m.user_id = auth.uid()));

-- 4) Cobranças
CREATE POLICY "Members can view shared charges"
  ON public.charges FOR SELECT TO authenticated
  USING (public.has_property_access(auth.uid(), property_id));

CREATE POLICY "Members can update shared charges"
  ON public.charges FOR UPDATE TO authenticated
  USING (public.has_property_access(auth.uid(), property_id));

CREATE POLICY "Members can view shared charge attachments"
  ON public.charge_attachments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.charges c WHERE c.id = charge_attachments.charge_id AND public.has_property_access(auth.uid(), c.property_id)));

CREATE POLICY "Members can view shared charge messages"
  ON public.charge_messages FOR SELECT TO authenticated
  USING (
    NOT is_internal
    AND EXISTS (SELECT 1 FROM public.charges c WHERE c.id = charge_messages.charge_id AND public.has_property_access(auth.uid(), c.property_id))
  );

CREATE POLICY "Members can create shared charge messages"
  ON public.charge_messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (SELECT 1 FROM public.charges c WHERE c.id = charge_messages.charge_id AND public.has_property_access(auth.uid(), c.property_id))
  );

CREATE POLICY "Members can view shared charge message attachments"
  ON public.charge_message_attachments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.charge_messages cm
    JOIN public.charges c ON c.id = cm.charge_id
    WHERE cm.id = charge_message_attachments.message_id
      AND public.has_property_access(auth.uid(), c.property_id)
  ));

CREATE POLICY "Members can upload shared charge message attachments"
  ON public.charge_message_attachments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.charges c
    WHERE c.id = charge_message_attachments.charge_id
      AND public.has_property_access(auth.uid(), c.property_id)
  ));

CREATE POLICY "Members can view shared charge payments"
  ON public.charge_payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.charges c WHERE c.id = charge_payments.charge_id AND public.has_property_access(auth.uid(), c.property_id)));

CREATE POLICY "Members can add shared charge payments"
  ON public.charge_payments FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (SELECT 1 FROM public.charges c WHERE c.id = charge_payments.charge_id AND public.has_property_access(auth.uid(), c.property_id))
  );

-- 5) Chamados / manutenções
CREATE POLICY "Members can view shared tickets"
  ON public.tickets FOR SELECT TO authenticated
  USING (public.has_property_access(auth.uid(), property_id));

CREATE POLICY "Members can create shared tickets"
  ON public.tickets FOR INSERT TO authenticated
  WITH CHECK (public.has_property_access(auth.uid(), property_id));

CREATE POLICY "Members can update shared tickets"
  ON public.tickets FOR UPDATE TO authenticated
  USING (public.has_property_access(auth.uid(), property_id));

CREATE POLICY "Members can view shared ticket messages"
  ON public.ticket_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_messages.ticket_id AND public.has_property_access(auth.uid(), t.property_id)));

CREATE POLICY "Members can create shared ticket messages"
  ON public.ticket_messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_messages.ticket_id AND public.has_property_access(auth.uid(), t.property_id))
  );

CREATE POLICY "Members can view shared ticket attachments"
  ON public.ticket_attachments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_attachments.ticket_id AND public.has_property_access(auth.uid(), t.property_id)));

CREATE POLICY "Members can upload shared ticket attachments"
  ON public.ticket_attachments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_attachments.ticket_id AND public.has_property_access(auth.uid(), t.property_id)));

-- 6) Comissões de reserva
CREATE POLICY "Members can view shared booking commissions"
  ON public.booking_commissions FOR SELECT TO authenticated
  USING (public.has_property_access(auth.uid(), property_id));

CREATE POLICY "Members can view shared commission messages"
  ON public.booking_commission_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.booking_commissions bc WHERE bc.id = booking_commission_messages.commission_id AND public.has_property_access(auth.uid(), bc.property_id)));

CREATE POLICY "Members can insert shared commission messages"
  ON public.booking_commission_messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (SELECT 1 FROM public.booking_commissions bc WHERE bc.id = booking_commission_messages.commission_id AND public.has_property_access(auth.uid(), bc.property_id))
  );

CREATE POLICY "Members can view shared commission attachments"
  ON public.booking_commission_attachments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.booking_commissions bc WHERE bc.id = booking_commission_attachments.commission_id AND public.has_property_access(auth.uid(), bc.property_id)));

-- 7) Vistorias, relatórios, bloqueios, fichas e propostas
CREATE POLICY "Members can view shared inspections"
  ON public.cleaning_inspections FOR SELECT TO authenticated
  USING (public.has_property_access(auth.uid(), property_id));

CREATE POLICY "Members can view shared financial reports"
  ON public.financial_reports FOR SELECT TO authenticated
  USING (public.has_property_access(auth.uid(), property_id));

CREATE POLICY "Members can view shared date block requests"
  ON public.date_block_requests FOR SELECT TO authenticated
  USING (public.has_property_access(auth.uid(), property_id));

CREATE POLICY "Members can create shared date block requests"
  ON public.date_block_requests FOR INSERT TO authenticated
  WITH CHECK (public.has_property_access(auth.uid(), property_id));

CREATE POLICY "Members can view shared property files"
  ON public.property_files FOR SELECT TO authenticated
  USING (public.has_property_access(auth.uid(), property_id));

CREATE POLICY "Members can view shared proposals"
  ON public.proposals FOR SELECT TO authenticated
  USING (public.has_property_access(auth.uid(), property_id));