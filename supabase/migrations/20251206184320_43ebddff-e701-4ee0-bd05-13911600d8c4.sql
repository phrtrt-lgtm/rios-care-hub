-- Add guest checkout date field for guest-responsible maintenance tickets
ALTER TABLE public.tickets 
ADD COLUMN IF NOT EXISTS guest_checkout_date date;

-- Add index for efficient querying of guest charge reminders
CREATE INDEX IF NOT EXISTS idx_tickets_guest_checkout 
ON public.tickets (guest_checkout_date) 
WHERE cost_responsible = 'guest' AND guest_checkout_date IS NOT NULL;