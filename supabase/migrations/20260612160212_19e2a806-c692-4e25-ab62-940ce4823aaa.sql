
CREATE POLICY "Owner read own contract attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'contract-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Owner upload own contract attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contract-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Owner delete own contract attachments" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'contract-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Admin all contract buckets" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id IN ('contract-attachments','contracts') AND public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (bucket_id IN ('contract-attachments','contracts') AND public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Owner read own generated contracts" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'contracts' AND (storage.foldername(name))[1] = auth.uid()::text);
