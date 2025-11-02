-- Add property_id to charges table
ALTER TABLE public.charges 
ADD COLUMN property_id uuid REFERENCES public.properties(id);

-- Add index for better query performance
CREATE INDEX idx_charges_property_id ON public.charges(property_id);