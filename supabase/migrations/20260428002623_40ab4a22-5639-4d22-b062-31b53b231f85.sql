-- 1) Restringir RLS: owners não podem mais ver charges em status draft
DROP POLICY IF EXISTS "Owners can view their charges" ON public.charges;
CREATE POLICY "Owners can view their charges"
  ON public.charges FOR SELECT
  USING (auth.uid() = owner_id AND status <> 'draft');

-- 2) Copiar valores das charges draft órfãs para o draft do ticket
UPDATE public.tickets t
SET
  charge_draft_amount_cents = c.amount_cents,
  charge_draft_management_contribution_cents = c.management_contribution_cents,
  charge_draft_category = c.category,
  charge_draft_title = c.title
FROM public.charges c
WHERE c.ticket_id = t.id
  AND c.status = 'draft'
  AND c.archived_at IS NULL
  AND t.charge_sent_at IS NULL
  AND t.charge_draft_amount_cents IS NULL;

-- 3) Arquivar as charges draft órfãs
UPDATE public.charges
SET archived_at = now()
WHERE status = 'draft'
  AND archived_at IS NULL
  AND ticket_id IN (
    SELECT id FROM public.tickets WHERE charge_sent_at IS NULL
  );