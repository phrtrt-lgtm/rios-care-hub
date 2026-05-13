ALTER TABLE public.owner_curations
  ADD COLUMN IF NOT EXISTS owner_purchase_choice text,
  ADD COLUMN IF NOT EXISTS owner_purchase_chosen_at timestamptz;
ALTER TABLE public.owner_curations
  DROP CONSTRAINT IF EXISTS owner_curations_owner_purchase_choice_check;
ALTER TABLE public.owner_curations
  ADD CONSTRAINT owner_curations_owner_purchase_choice_check
  CHECK (owner_purchase_choice IS NULL OR owner_purchase_choice IN ('rios', 'self'));