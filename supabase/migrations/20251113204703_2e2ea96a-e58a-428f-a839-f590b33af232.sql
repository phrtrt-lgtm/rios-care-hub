-- Add service_type column to charges table
ALTER TABLE public.charges 
ADD COLUMN service_type TEXT;

-- Create index for better query performance
CREATE INDEX idx_charges_service_type ON public.charges(service_type);

COMMENT ON COLUMN public.charges.service_type IS 'Type of service from Monday.com label (hidraulica, eletrica, marcenaria, etc.)';