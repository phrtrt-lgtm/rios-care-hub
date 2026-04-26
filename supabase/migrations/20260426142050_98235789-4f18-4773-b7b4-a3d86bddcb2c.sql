CREATE POLICY "Owners can view their property files"
ON public.property_files
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = property_files.property_id
      AND p.owner_id = auth.uid()
  )
);