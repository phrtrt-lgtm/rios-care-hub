-- Adicionar campos de manutenção à tabela charges existente
ALTER TABLE charges 
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS cost_responsible TEXT DEFAULT 'owner',
ADD COLUMN IF NOT EXISTS split_owner_percent INT CHECK (split_owner_percent BETWEEN 0 AND 100);

CREATE INDEX IF NOT EXISTS idx_charges_category ON charges(category);
CREATE INDEX IF NOT EXISTS idx_charges_cost_responsible ON charges(cost_responsible);

-- Criar tabela de pagamentos parciais para charges
CREATE TABLE IF NOT EXISTS charge_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id UUID NOT NULL REFERENCES charges(id) ON DELETE CASCADE,
  amount_cents INT NOT NULL CHECK (amount_cents > 0),
  payment_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  method TEXT DEFAULT 'pix',
  applies_to TEXT NOT NULL DEFAULT 'total',
  proof_file_url TEXT,
  note TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cpay_charge ON charge_payments(charge_id);

-- RLS para charge_payments
ALTER TABLE charge_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view payments from their charges"
ON charge_payments FOR SELECT
USING (EXISTS (
  SELECT 1 FROM charges
  WHERE charges.id = charge_payments.charge_id
  AND (charges.owner_id = auth.uid() OR is_team_member(auth.uid()))
));

CREATE POLICY "Owners can add payments to their charges"
ON charge_payments FOR INSERT
WITH CHECK (
  auth.uid() = created_by
  AND EXISTS (
    SELECT 1 FROM charges
    WHERE charges.id = charge_payments.charge_id
    AND charges.owner_id = auth.uid()
  )
);

CREATE POLICY "Team can add payments"
ON charge_payments FOR INSERT
WITH CHECK (is_team_member(auth.uid()));

CREATE POLICY "Team can delete payments"
ON charge_payments FOR DELETE
USING (is_team_member(auth.uid()));