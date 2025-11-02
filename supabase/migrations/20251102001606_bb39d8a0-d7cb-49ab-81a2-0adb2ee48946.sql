-- Garantir estrutura correta de ticket_attachments
-- Colunas essenciais
ALTER TABLE ticket_attachments
  ADD COLUMN IF NOT EXISTS ticket_id UUID;

ALTER TABLE ticket_attachments
  ADD COLUMN IF NOT EXISTS file_type TEXT;

ALTER TABLE ticket_attachments
  ADD COLUMN IF NOT EXISTS name TEXT;

-- Obrigatoriedade mínima
ALTER TABLE ticket_attachments
  ALTER COLUMN file_url SET NOT NULL;

-- FK (se já existir, ignora)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ticket_attachments_ticket_id_fkey'
  ) THEN
    ALTER TABLE ticket_attachments
      ADD CONSTRAINT ticket_attachments_ticket_id_fkey
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;
  END IF;
END$$;

-- Índices
CREATE INDEX IF NOT EXISTS idx_ta_ticket ON ticket_attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ta_message ON ticket_attachments(message_id);