-- Allow 'pending' as a value for cost_responsible to represent maintenance items
-- whose cost responsibility hasn't been defined yet (hidden from owners until set).
ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_cost_responsible_check;

ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_cost_responsible_check
  CHECK (cost_responsible = ANY (ARRAY['owner'::text, 'pm'::text, 'guest'::text, 'pending'::text]));