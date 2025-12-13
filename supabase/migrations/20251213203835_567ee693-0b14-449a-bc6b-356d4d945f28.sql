-- Add archived_at column to cleaning_inspections for archiving
ALTER TABLE public.cleaning_inspections 
ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone DEFAULT NULL;

-- Allow admin to update cleaning_inspections (for archiving)
CREATE POLICY "Admin can update inspections" 
ON public.cleaning_inspections 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow admin to delete cleaning_inspections
CREATE POLICY "Admin can delete inspections" 
ON public.cleaning_inspections 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));