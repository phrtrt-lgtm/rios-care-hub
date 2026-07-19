
-- 1. owner_credits
CREATE TABLE public.owner_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  origin_type TEXT NOT NULL DEFAULT 'reserve_retention',
  origin_note TEXT,
  origin_reservations JSONB,
  initial_amount_cents INTEGER NOT NULL CHECK (initial_amount_cents >= 0),
  remaining_amount_cents INTEGER NOT NULL CHECK (remaining_amount_cents >= 0),
  status TEXT NOT NULL DEFAULT 'open',
  refunded_at TIMESTAMPTZ,
  refund_note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_owner_credits_owner ON public.owner_credits(owner_id);
CREATE INDEX idx_owner_credits_status ON public.owner_credits(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_credits TO authenticated;
GRANT ALL ON public.owner_credits TO service_role;

ALTER TABLE public.owner_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own credits"
  ON public.owner_credits FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid() OR public.is_team_member(auth.uid()));

CREATE POLICY "Team manages credits"
  ON public.owner_credits FOR ALL
  TO authenticated
  USING (public.is_team_member(auth.uid()))
  WITH CHECK (public.is_team_member(auth.uid()));

CREATE TRIGGER trg_owner_credits_updated_at
  BEFORE UPDATE ON public.owner_credits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. owner_credit_applications
CREATE TABLE public.owner_credit_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id UUID NOT NULL REFERENCES public.owner_credits(id) ON DELETE CASCADE,
  charge_id UUID NOT NULL REFERENCES public.charges(id) ON DELETE CASCADE,
  amount_applied_cents INTEGER NOT NULL CHECK (amount_applied_cents > 0),
  applied_by UUID REFERENCES auth.users(id),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_credit_apps_credit ON public.owner_credit_applications(credit_id);
CREATE INDEX idx_credit_apps_charge ON public.owner_credit_applications(charge_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_credit_applications TO authenticated;
GRANT ALL ON public.owner_credit_applications TO service_role;

ALTER TABLE public.owner_credit_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own credit applications"
  ON public.owner_credit_applications FOR SELECT
  TO authenticated
  USING (
    public.is_team_member(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.owner_credits c
      WHERE c.id = credit_id AND c.owner_id = auth.uid()
    )
  );

CREATE POLICY "Team manages credit applications"
  ON public.owner_credit_applications FOR ALL
  TO authenticated
  USING (public.is_team_member(auth.uid()))
  WITH CHECK (public.is_team_member(auth.uid()));

-- 3. New charges columns
ALTER TABLE public.charges
  ADD COLUMN IF NOT EXISTS retroactive_debit BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS credit_applied_cents INTEGER NOT NULL DEFAULT 0;
