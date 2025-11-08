-- Adicionar público-alvo às propostas
ALTER TABLE proposals 
ADD COLUMN target_audience TEXT NOT NULL DEFAULT 'owners' CHECK (target_audience IN ('owners', 'team'));

-- Criar tabela de opções de votação
CREATE TABLE proposal_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para melhor performance
CREATE INDEX idx_proposal_options_proposal_id ON proposal_options(proposal_id);

-- RLS para proposal_options
ALTER TABLE proposal_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can manage proposal options"
ON proposal_options FOR ALL
USING (is_team_member(auth.uid()));

CREATE POLICY "Owners can view options from their proposals"
ON proposal_options FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM proposal_responses pr
    WHERE pr.proposal_id = proposal_options.proposal_id
    AND pr.owner_id = auth.uid()
  )
);

-- Modificar proposal_responses para usar opções
ALTER TABLE proposal_responses 
ADD COLUMN selected_option_id UUID REFERENCES proposal_options(id) ON DELETE SET NULL,
ADD COLUMN is_visible_to_owner BOOLEAN NOT NULL DEFAULT true;

-- Atualizar RLS para respostas internas
DROP POLICY IF EXISTS "Owners can view their own responses" ON proposal_responses;

CREATE POLICY "Owners can view their allowed responses"
ON proposal_responses FOR SELECT
USING (
  auth.uid() = owner_id 
  AND is_visible_to_owner = true
);

-- Trigger para enviar notificação de vencimento
CREATE OR REPLACE FUNCTION notify_proposal_deadline()
RETURNS TRIGGER AS $$
BEGIN
  -- Aqui a edge function será chamada via cron
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;