-- Allow maintenance role to update and delete (archive) inspections, same as admin
DROP POLICY IF EXISTS "Admin can update inspections" ON public.cleaning_inspections;
DROP POLICY IF EXISTS "Admin can delete inspections" ON public.cleaning_inspections;

CREATE POLICY "Admin and maintenance can update inspections"
ON public.cleaning_inspections
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'maintenance'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Admin and maintenance can delete inspections"
ON public.cleaning_inspections
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'maintenance'::app_role));