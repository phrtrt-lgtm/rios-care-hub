
-- Update cleaning_inspections policy to allow owners to see routine inspections
-- regardless of owner_portal_enabled setting
DROP POLICY IF EXISTS "Owners can view inspections of their properties" ON public.cleaning_inspections;

CREATE POLICY "Owners can view inspections of their properties"
ON public.cleaning_inspections
FOR SELECT
USING (
  internal_only = false
  AND EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = cleaning_inspections.property_id
      AND p.owner_id = auth.uid()
      AND (
        -- Vistorias de rotina: sempre visíveis para o proprietário
        cleaning_inspections.is_routine = true
        OR
        -- Vistorias normais: só se owner_portal_enabled = true
        EXISTS (
          SELECT 1 FROM inspection_settings s
          WHERE s.property_id = p.id AND s.owner_portal_enabled = true
        )
      )
  )
);

-- Allow owners to view routine_inspection_checklists for their properties
DROP POLICY IF EXISTS "Owners can view routine checklists of their properties" ON public.routine_inspection_checklists;

CREATE POLICY "Owners can view routine checklists of their properties"
ON public.routine_inspection_checklists
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM cleaning_inspections ci
    JOIN properties p ON p.id = ci.property_id
    WHERE ci.id = routine_inspection_checklists.inspection_id
      AND p.owner_id = auth.uid()
      AND ci.is_routine = true
      AND ci.internal_only = false
  )
);

-- Update inspection_items policy to also show items from routine inspections to owners
DROP POLICY IF EXISTS "Owners can view their inspection items" ON public.inspection_items;

CREATE POLICY "Owners can view their inspection items"
ON public.inspection_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM cleaning_inspections ci
    JOIN properties p ON p.id = ci.property_id
    WHERE ci.id = inspection_items.inspection_id
      AND p.owner_id = auth.uid()
      AND ci.internal_only = false
      AND (
        ci.is_routine = true
        OR EXISTS (
          SELECT 1 FROM inspection_settings s
          WHERE s.property_id = p.id AND s.owner_portal_enabled = true
        )
      )
  )
);
