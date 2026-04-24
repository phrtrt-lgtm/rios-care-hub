
-- Tabela de atualizações de manutenção (proprietário lê, equipe escreve)
CREATE TABLE public.maintenance_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid,
  charge_id uuid,
  author_id uuid NOT NULL,
  body text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT maintenance_updates_target_check CHECK (ticket_id IS NOT NULL OR charge_id IS NOT NULL)
);

CREATE INDEX idx_maintenance_updates_ticket ON public.maintenance_updates(ticket_id);
CREATE INDEX idx_maintenance_updates_charge ON public.maintenance_updates(charge_id);
CREATE INDEX idx_maintenance_updates_created ON public.maintenance_updates(created_at DESC);

ALTER TABLE public.maintenance_updates ENABLE ROW LEVEL SECURITY;

-- Equipe pode tudo
CREATE POLICY "Team can manage maintenance updates"
ON public.maintenance_updates
FOR ALL
USING (public.is_team_member(auth.uid()))
WITH CHECK (public.is_team_member(auth.uid()));

-- Proprietário pode ver atualizações de seus tickets/charges
CREATE POLICY "Owners can view their maintenance updates"
ON public.maintenance_updates
FOR SELECT
USING (
  deleted_at IS NULL AND (
    (ticket_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = maintenance_updates.ticket_id AND t.owner_id = auth.uid()
    ))
    OR
    (charge_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.charges c
      WHERE c.id = maintenance_updates.charge_id AND c.owner_id = auth.uid()
    ))
  )
);

-- Trigger: ao inserir update, criar notificação para o proprietário
CREATE OR REPLACE FUNCTION public.notify_maintenance_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_subject text;
  v_link text;
  v_target_id uuid;
BEGIN
  IF NEW.ticket_id IS NOT NULL THEN
    SELECT owner_id, subject INTO v_owner_id, v_subject
    FROM public.tickets WHERE id = NEW.ticket_id;
    v_target_id := NEW.ticket_id;
  ELSIF NEW.charge_id IS NOT NULL THEN
    SELECT owner_id, title INTO v_owner_id, v_subject
    FROM public.charges WHERE id = NEW.charge_id;
    v_target_id := NEW.charge_id;
  END IF;

  IF v_owner_id IS NULL OR v_owner_id = NEW.author_id THEN
    RETURN NEW;
  END IF;

  v_link := '/manutencao/' || v_target_id::text;

  INSERT INTO public.notifications (owner_id, type, title, message, reference_url, reference_id, entity_type, entity_id)
  VALUES (
    v_owner_id,
    'maintenance_update',
    'Nova atualização da manutenção',
    COALESCE(v_subject, 'Manutenção') || ': ' || left(NEW.body, 120),
    v_link,
    v_target_id,
    CASE WHEN NEW.ticket_id IS NOT NULL THEN 'ticket' ELSE 'charge' END,
    v_target_id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_maintenance_update
AFTER INSERT ON public.maintenance_updates
FOR EACH ROW
EXECUTE FUNCTION public.notify_maintenance_update();
