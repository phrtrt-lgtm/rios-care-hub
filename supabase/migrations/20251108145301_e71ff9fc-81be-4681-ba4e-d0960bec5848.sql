-- 1) Tabela de aceites da política de manutenção por proprietário
CREATE TABLE IF NOT EXISTS public.maintenance_policy_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  policy_version TEXT NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (owner_id, policy_version)
);

-- RLS para aceites
ALTER TABLE public.maintenance_policy_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their own acceptances"
ON public.maintenance_policy_acceptances
FOR SELECT
USING (auth.uid() = owner_id);

CREATE POLICY "Owners can create their own acceptances"
ON public.maintenance_policy_acceptances
FOR INSERT
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Team can view all acceptances"
ON public.maintenance_policy_acceptances
FOR SELECT
USING (is_team_member(auth.uid()));

-- 2) Extensões em tickets para manutenção
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS kind TEXT CHECK (kind IN ('support','maintenance')) DEFAULT 'support',
  ADD COLUMN IF NOT EXISTS essential BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS owner_decision TEXT CHECK (owner_decision IN ('owner_will_fix','pm_will_fix')) NULL,
  ADD COLUMN IF NOT EXISTS owner_action_due_at TIMESTAMP WITH TIME ZONE NULL;

-- 3) Índices úteis
CREATE INDEX IF NOT EXISTS idx_tickets_kind ON public.tickets(kind);
CREATE INDEX IF NOT EXISTS idx_tickets_owner_decision ON public.tickets(owner_decision);
CREATE INDEX IF NOT EXISTS idx_tickets_owner_action_due ON public.tickets(owner_action_due_at);