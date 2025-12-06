-- Add cost_responsible column to tickets table for maintenance cost responsibility
-- This determines who pays for maintenance: 'owner', 'pm' (property management), or 'guest'
-- Tickets with 'guest' responsibility will be hidden from property owners

ALTER TABLE public.tickets 
ADD COLUMN IF NOT EXISTS cost_responsible text DEFAULT 'owner' 
CHECK (cost_responsible IN ('owner', 'pm', 'guest'));

-- Add index for filtering by cost_responsible
CREATE INDEX IF NOT EXISTS idx_tickets_cost_responsible ON public.tickets(cost_responsible);

-- Comment for documentation
COMMENT ON COLUMN public.tickets.cost_responsible IS 'Who pays for this maintenance: owner, pm (property management), or guest. Guest maintenance is hidden from property owners.';