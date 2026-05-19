ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS guest_charge_dismissed_at timestamptz NULL;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS guest_charge_dismissed_by uuid NULL;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS guest_charge_dismiss_reason text NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_guest_charge_dismissed_at ON public.tickets(guest_charge_dismissed_at) WHERE guest_charge_dismissed_at IS NOT NULL;