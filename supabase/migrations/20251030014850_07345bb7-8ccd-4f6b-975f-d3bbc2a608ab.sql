-- Adicionar novos campos em charges sem mudar o tipo de status por enquanto
ALTER TABLE charges ADD COLUMN IF NOT EXISTS contested_at timestamptz;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS debit_notice_at timestamptz;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS debited_at timestamptz;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS owner_note text;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS owner_proof_path text;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS reminder_48h_sent boolean DEFAULT false;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS reminder_24h_sent boolean DEFAULT false;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS reminder_day_sent boolean DEFAULT false;

-- Criar tabela de broadcasts
CREATE TABLE IF NOT EXISTS broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  body_html text NOT NULL,
  recipients_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES profiles(id) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  include_rules_link boolean DEFAULT false
);

ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can manage broadcasts"
  ON broadcasts FOR ALL
  USING (is_team_member(auth.uid()));

-- Criar tabela de destinatários de broadcast
CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid REFERENCES broadcasts(id) ON DELETE CASCADE NOT NULL,
  owner_id uuid REFERENCES profiles(id) NOT NULL,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE broadcast_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view broadcast recipients"
  ON broadcast_recipients FOR SELECT
  USING (is_team_member(auth.uid()));

-- Criar tabela de configurações do sistema
CREATE TABLE IF NOT EXISTS system_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES profiles(id)
);

ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can manage system config"
  ON system_config FOR ALL
  USING (is_team_member(auth.uid()));

-- Inserir configurações padrão
INSERT INTO system_config (key, value)
VALUES (
  'billing_rules',
  '{
    "deadline_days": 7,
    "content": {
      "title": "Regras de Cobrança",
      "sections": [
        {
          "title": "Prazo de Pagamento",
          "content": "Toda cobrança tem vencimento em 7 dias corridos a partir do envio."
        },
        {
          "title": "Contestação",
          "content": "Nesse período, o proprietário pode contestar anexando evidências (fotos/vídeos/comprovante) direto na cobrança. O caso será reavaliado pela equipe."
        },
        {
          "title": "Comprovante de Pagamento",
          "content": "Para pagamentos via PIX/transferência, anexar o comprovante na própria cobrança (botão Anexar comprovante)."
        },
        {
          "title": "Após o Vencimento",
          "content": "Se não houver pagamento nem contestação procedente, o valor poderá ser debitado das próximas reservas do proprietário (conforme contrato). O portal enviará aviso de débito por e-mail."
        },
        {
          "title": "Canais Oficiais",
          "content": "Toda tratativa deve ocorrer dentro do portal, para registro e transparência."
        }
      ]
    }
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO system_config (key, value)
VALUES (
  'email_signature',
  '{
    "company_name": "RIOS – Operação e Gestão de Hospedagens",
    "support_email": "suporte@rios.com.br",
    "support_phone": "+55 (00) 0000-0000"
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_system_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS system_config_updated_at ON system_config;
CREATE TRIGGER system_config_updated_at
  BEFORE UPDATE ON system_config
  FOR EACH ROW
  EXECUTE FUNCTION update_system_config_updated_at();