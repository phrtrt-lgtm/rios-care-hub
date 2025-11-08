-- Create proposals storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('proposals', 'proposals', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for proposals bucket
CREATE POLICY "Team can upload proposal files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'proposals' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'agent', 'maintenance')
  )
);

CREATE POLICY "Team can view all proposal files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'proposals' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'agent', 'maintenance')
  )
);

CREATE POLICY "Owners can view their proposal files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'proposals' AND
  EXISTS (
    SELECT 1 FROM proposal_responses pr
    JOIN proposals p ON p.id = pr.proposal_id
    WHERE pr.owner_id = auth.uid()
    AND name LIKE 'proposals/' || p.id::text || '%'
  )
);