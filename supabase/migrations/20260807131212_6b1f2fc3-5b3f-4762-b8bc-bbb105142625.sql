DROP POLICY IF EXISTS "Team can view payment proofs" ON storage.objects;
CREATE POLICY "Team can view payment proofs"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'maintenance-payment-proofs'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = ANY (ARRAY['admin'::app_role, 'agent'::app_role, 'maintenance'::app_role])
  )
);