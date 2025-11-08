-- Criar tabela de anexos por mensagem de cobrança
CREATE TABLE IF NOT EXISTS charge_message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES charge_messages(id) ON DELETE CASCADE,
  charge_id UUID NOT NULL REFERENCES charges(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES profiles(id)
);

-- Enable RLS
ALTER TABLE charge_message_attachments ENABLE ROW LEVEL SECURITY;

-- Policies: owners and team can view attachments from charges they have access to
CREATE POLICY "Owners and team can view charge message attachments"
ON charge_message_attachments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM charges
    WHERE charges.id = charge_message_attachments.charge_id
    AND (charges.owner_id = auth.uid() OR is_team_member(auth.uid()))
  )
);

-- Team can upload charge message attachments
CREATE POLICY "Team can upload charge message attachments"
ON charge_message_attachments
FOR INSERT
TO authenticated
WITH CHECK (is_team_member(auth.uid()));

-- Owners can upload charge message attachments to their charges
CREATE POLICY "Owners can upload charge message attachments"
ON charge_message_attachments
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM charges
    WHERE charges.id = charge_message_attachments.charge_id
    AND charges.owner_id = auth.uid()
  )
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_charge_message_attachments_message_id ON charge_message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_charge_message_attachments_charge_id ON charge_message_attachments(charge_id);