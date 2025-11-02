-- Corrigir políticas RLS do bucket attachments

-- Remove políticas antigas se existirem
DROP POLICY IF EXISTS "Users can upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can view attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Public can view attachments" ON storage.objects;

-- Permitir upload de anexos para usuários autenticados
CREATE POLICY "Authenticated users can upload to attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'attachments'
);

-- Permitir leitura pública (bucket já é público)
CREATE POLICY "Anyone can view attachments"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'attachments');

-- Permitir update apenas do próprio arquivo
CREATE POLICY "Users can update own attachments"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'attachments' AND auth.uid()::text = (storage.foldername(name))[2])
WITH CHECK (bucket_id = 'attachments' AND auth.uid()::text = (storage.foldername(name))[2]);

-- Permitir delete apenas do próprio arquivo
CREATE POLICY "Users can delete own attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'attachments' AND auth.uid()::text = (storage.foldername(name))[2]);