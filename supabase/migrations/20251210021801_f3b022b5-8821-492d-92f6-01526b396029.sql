-- Create proposal_items table for multiple items with different prices
CREATE TABLE public.proposal_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.proposal_items ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Owners can view items from their proposals" 
ON public.proposal_items 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM proposal_responses pr
  WHERE pr.proposal_id = proposal_items.proposal_id AND pr.owner_id = auth.uid()
));

CREATE POLICY "Team can manage proposal items" 
ON public.proposal_items 
FOR ALL 
USING (is_team_member(auth.uid()));

-- Create proposal_response_items to track quantities per item
CREATE TABLE public.proposal_response_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  response_id UUID NOT NULL REFERENCES public.proposal_responses(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.proposal_items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(response_id, item_id)
);

-- Enable RLS
ALTER TABLE public.proposal_response_items ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Owners can manage their response items" 
ON public.proposal_response_items 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM proposal_responses pr
  WHERE pr.id = proposal_response_items.response_id AND pr.owner_id = auth.uid()
));

CREATE POLICY "Team can view all response items" 
ON public.proposal_response_items 
FOR SELECT 
USING (is_team_member(auth.uid()));

-- Add new payment_type value: 'items' for multiple items
-- (payment_type already exists as text, just use 'items' as new value)