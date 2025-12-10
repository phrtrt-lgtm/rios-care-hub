-- Add payment tracking fields to proposal_responses
ALTER TABLE public.proposal_responses 
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS payment_amount_cents INTEGER,
ADD COLUMN IF NOT EXISTS mercadopago_payment_id TEXT,
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT NULL;

-- Create index for faster queries on paid proposals
CREATE INDEX IF NOT EXISTS idx_proposal_responses_paid 
ON public.proposal_responses(proposal_id) 
WHERE paid_at IS NOT NULL;