ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS charge_draft_amount_cents integer,
  ADD COLUMN IF NOT EXISTS charge_draft_management_contribution_cents integer,
  ADD COLUMN IF NOT EXISTS charge_draft_category text,
  ADD COLUMN IF NOT EXISTS charge_draft_title text,
  ADD COLUMN IF NOT EXISTS charge_sent_at timestamp with time zone;