CREATE TABLE public.recurring_charges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  vendor_name TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  management_contribution_cents INTEGER NOT NULL DEFAULT 0,
  due_day INTEGER NOT NULL DEFAULT 10,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  last_generated_period DATE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT recurring_charges_due_day_check CHECK (due_day >= 1 AND due_day <= 31),
  CONSTRAINT recurring_charges_amount_check CHECK (amount_cents >= 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_charges TO authenticated;
GRANT ALL ON public.recurring_charges TO service_role;

ALTER TABLE public.recurring_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can manage recurring charges"
ON public.recurring_charges FOR ALL TO authenticated
USING (public.is_team_member(auth.uid()))
WITH CHECK (public.is_team_member(auth.uid()));

CREATE POLICY "Owners can view their recurring charges"
ON public.recurring_charges FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR public.has_property_access(auth.uid(), property_id));

CREATE TRIGGER update_recurring_charges_updated_at
BEFORE UPDATE ON public.recurring_charges
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.recurring_charge_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recurring_charge_id UUID NOT NULL REFERENCES public.recurring_charges(id) ON DELETE CASCADE,
  period DATE NOT NULL,
  charge_id UUID REFERENCES public.charges(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (recurring_charge_id, period)
);

GRANT SELECT ON public.recurring_charge_runs TO authenticated;
GRANT ALL ON public.recurring_charge_runs TO service_role;

ALTER TABLE public.recurring_charge_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view recurring runs"
ON public.recurring_charge_runs FOR SELECT TO authenticated
USING (public.is_team_member(auth.uid()));

CREATE POLICY "Owners can view runs of their recurring charges"
ON public.recurring_charge_runs FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.recurring_charges rc
  WHERE rc.id = recurring_charge_id
    AND (rc.owner_id = auth.uid() OR public.has_property_access(auth.uid(), rc.property_id))
));

ALTER TABLE public.charges ADD COLUMN IF NOT EXISTS recurring_charge_id UUID REFERENCES public.recurring_charges(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_charges_recurring_charge_id ON public.charges(recurring_charge_id);
CREATE INDEX IF NOT EXISTS idx_recurring_charges_active ON public.recurring_charges(active, due_day);