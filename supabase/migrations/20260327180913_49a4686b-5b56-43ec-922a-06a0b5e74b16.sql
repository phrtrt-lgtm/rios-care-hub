
CREATE TABLE public.financial_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public.properties(id),
  owner_id uuid NOT NULL,
  property_name text NOT NULL,
  report_type text NOT NULL,
  report_data jsonb NOT NULL,
  period_start date,
  period_end date,
  commission_percentage numeric NOT NULL DEFAULT 20,
  status text NOT NULL DEFAULT 'published',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view own reports" ON public.financial_reports
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Team can manage reports" ON public.financial_reports
  FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid()));

CREATE TRIGGER update_financial_reports_updated_at
  BEFORE UPDATE ON public.financial_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
