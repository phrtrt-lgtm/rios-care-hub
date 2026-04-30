INSERT INTO storage.buckets (id, name, public)
VALUES ('charge-attachments', 'charge-attachments', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload to charge attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view charge attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update charge attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete charge attachments" ON storage.objects;

CREATE POLICY "Authenticated users can upload to charge attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'charge-attachments');

CREATE POLICY "Authenticated users can view charge attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'charge-attachments');

CREATE POLICY "Authenticated users can update charge attachments"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'charge-attachments')
WITH CHECK (bucket_id = 'charge-attachments');

CREATE POLICY "Authenticated users can delete charge attachments"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'charge-attachments');