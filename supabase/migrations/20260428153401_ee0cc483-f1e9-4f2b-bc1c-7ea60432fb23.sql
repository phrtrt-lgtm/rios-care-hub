-- Allow admin and maintenance team to delete inspection attachments
CREATE POLICY "Team can delete inspection attachments"
ON public.cleaning_inspection_attachments
FOR DELETE
TO authenticated
USING (is_team_member(auth.uid()));

-- Allow team to delete charge attachments
CREATE POLICY "Team can delete charge attachments"
ON public.charge_attachments
FOR DELETE
TO authenticated
USING (is_team_member(auth.uid()));

-- Hide archived inspections from owners (replace existing SELECT policy to add archived_at filter)
DROP POLICY IF EXISTS "Owners can view inspections of their properties" ON public.cleaning_inspections;
CREATE POLICY "Owners can view inspections of their properties"
ON public.cleaning_inspections
FOR SELECT
TO public
USING (
  archived_at IS NULL
  AND internal_only = false
  AND EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = cleaning_inspections.property_id
      AND p.owner_id = auth.uid()
      AND (
        cleaning_inspections.is_routine = true
        OR EXISTS (
          SELECT 1 FROM inspection_settings s
          WHERE s.property_id = p.id AND s.owner_portal_enabled = true
        )
      )
  )
);