-- Criar bucket para fotos de propriedades se não existir
INSERT INTO storage.buckets (id, name, public)
VALUES ('property-photos', 'property-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas RLS para property-photos
CREATE POLICY "Team can upload property photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'property-photos' 
  AND (EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role IN ('admin', 'agent')
  ))
);

CREATE POLICY "Team can update property photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'property-photos'
  AND (EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role IN ('admin', 'agent')
  ))
);

CREATE POLICY "Team can delete property photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'property-photos'
  AND (EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role IN ('admin', 'agent')
  ))
);

CREATE POLICY "Public can view property photos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'property-photos');