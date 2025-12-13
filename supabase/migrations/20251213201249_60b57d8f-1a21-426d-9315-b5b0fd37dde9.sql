-- Create policy to allow admins to delete properties
CREATE POLICY "Admins can delete properties" 
ON public.properties 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));