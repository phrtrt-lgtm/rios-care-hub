-- Add internal_only flag to cleaning_inspections
-- When true, the inspection is only visible to team members (admin, agent, maintenance)
ALTER TABLE public.cleaning_inspections 
ADD COLUMN internal_only boolean NOT NULL DEFAULT false;

-- Update RLS policy to hide internal inspections from owners
DROP POLICY IF EXISTS "Owners can view inspections of their properties" ON public.cleaning_inspections;

CREATE POLICY "Owners can view inspections of their properties" 
ON public.cleaning_inspections 
FOR SELECT 
USING (
  -- Only non-internal inspections are visible to owners
  internal_only = false AND
  EXISTS (
    SELECT 1 FROM properties p
    JOIN inspection_settings s ON s.property_id = p.id
    WHERE p.id = cleaning_inspections.property_id 
    AND p.owner_id = auth.uid() 
    AND s.owner_portal_enabled = true
  )
);

-- Update tickets RLS/query to hide management-responsible maintenance from owners
-- This is handled in application code by filtering cost_responsible != 'management'