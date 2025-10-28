-- Adicionar colunas necessárias para rastreamento de origem Monday
ALTER TABLE charge_attachments 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'lovable',
ADD COLUMN IF NOT EXISTS monday_asset_id TEXT,
ADD COLUMN IF NOT EXISTS mime_type_override TEXT;

-- Atualizar o mime_type existente para ser compatível
UPDATE charge_attachments 
SET source = 'lovable' 
WHERE source IS NULL;

-- Criar índice para melhorar performance de busca
CREATE INDEX IF NOT EXISTS idx_charge_attachments_monday ON charge_attachments(monday_asset_id) WHERE monday_asset_id IS NOT NULL;