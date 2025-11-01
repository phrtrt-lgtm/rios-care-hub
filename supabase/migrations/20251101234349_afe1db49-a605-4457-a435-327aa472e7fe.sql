-- Tornar message_id obrigatório
ALTER TABLE ticket_attachments 
ALTER COLUMN message_id SET NOT NULL;

-- Adicionar colunas faltantes se não existirem
ALTER TABLE ticket_attachments 
ADD COLUMN IF NOT EXISTS file_name TEXT,
ADD COLUMN IF NOT EXISTS file_url TEXT,
ADD COLUMN IF NOT EXISTS file_type TEXT,
ADD COLUMN IF NOT EXISTS size_bytes INTEGER;

-- Migrar path para file_url se necessário
UPDATE ticket_attachments 
SET file_url = path 
WHERE file_url IS NULL AND path IS NOT NULL;

-- Tornar file_url obrigatório após migração
ALTER TABLE ticket_attachments 
ALTER COLUMN file_url SET NOT NULL;

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_message_id 
ON ticket_attachments(message_id);

-- Atualizar RLS policies para incluir message_id
DROP POLICY IF EXISTS "Users can view attachments from their tickets" ON ticket_attachments;
DROP POLICY IF EXISTS "Users can upload attachments to their tickets" ON ticket_attachments;

CREATE POLICY "Users can view attachments from their tickets"
ON ticket_attachments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM ticket_messages tm
    JOIN tickets t ON t.id = tm.ticket_id
    WHERE tm.id = ticket_attachments.message_id
    AND (t.owner_id = auth.uid() OR is_team_member(auth.uid()))
  )
);

CREATE POLICY "Users can upload attachments to their tickets"
ON ticket_attachments FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM ticket_messages tm
    JOIN tickets t ON t.id = tm.ticket_id
    WHERE tm.id = ticket_attachments.message_id
    AND (t.owner_id = auth.uid() OR is_team_member(auth.uid()))
  )
);