-- Add management contribution column to charges table
ALTER TABLE public.charges 
ADD COLUMN management_contribution_cents integer DEFAULT 0 NOT NULL;

-- Add comment to explain the column
COMMENT ON COLUMN public.charges.management_contribution_cents IS 'Amount in cents contributed by management towards the charge';