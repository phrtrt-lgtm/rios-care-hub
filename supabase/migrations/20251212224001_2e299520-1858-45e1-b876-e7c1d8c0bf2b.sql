-- Create table to store individual inspection items extracted from AI analysis
CREATE TABLE public.inspection_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inspection_id UUID NOT NULL REFERENCES public.cleaning_inspections(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- e.g., "PEDREIRO", "HIDRÁULICA", etc.
  description TEXT NOT NULL, -- The actual problem description
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'management', 'owner', 'guest', 'completed'
  order_index INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID REFERENCES public.profiles(id),
  maintenance_ticket_id UUID REFERENCES public.tickets(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.inspection_items ENABLE ROW LEVEL SECURITY;

-- Team members can manage inspection items
CREATE POLICY "Team can manage inspection items"
ON public.inspection_items
FOR ALL
USING (is_team_member(auth.uid()))
WITH CHECK (is_team_member(auth.uid()));

-- Owners can view items from their property inspections
CREATE POLICY "Owners can view their inspection items"
ON public.inspection_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM cleaning_inspections ci
    JOIN properties p ON p.id = ci.property_id
    JOIN inspection_settings s ON s.property_id = p.id
    WHERE ci.id = inspection_items.inspection_id
    AND p.owner_id = auth.uid()
    AND s.owner_portal_enabled = true
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_inspection_items_updated_at
BEFORE UPDATE ON public.inspection_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();