-- Add payment configuration to proposals
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS payment_type text DEFAULT 'none';
-- 'none' = no payment, 'fixed' = fixed amount, 'quantity' = unit price x quantity

ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS unit_price_cents integer DEFAULT NULL;
-- Used when payment_type = 'quantity'

-- Add requires_payment flag to proposal_options
ALTER TABLE public.proposal_options ADD COLUMN IF NOT EXISTS requires_payment boolean DEFAULT false;

-- Add quantity field to proposal_responses for quantity-based proposals
ALTER TABLE public.proposal_responses ADD COLUMN IF NOT EXISTS quantity integer DEFAULT NULL;