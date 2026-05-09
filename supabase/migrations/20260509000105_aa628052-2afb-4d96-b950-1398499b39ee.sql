CREATE POLICY "Public can view published curations by id"
ON public.owner_curations
FOR SELECT
TO anon, authenticated
USING (status = 'published');