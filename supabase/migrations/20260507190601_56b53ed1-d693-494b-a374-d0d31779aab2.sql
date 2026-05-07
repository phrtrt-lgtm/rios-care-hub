
-- Tabela de curadorias por proprietário
CREATE TABLE public.owner_curations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  property_id UUID,
  title TEXT NOT NULL DEFAULT 'Curadoria RIOS',
  status TEXT NOT NULL DEFAULT 'draft', -- draft | published
  categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  observations JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_filename TEXT,
  ai_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.owner_curations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their published curations"
ON public.owner_curations FOR SELECT
USING (auth.uid() = owner_id AND status = 'published');

CREATE POLICY "Team can manage all curations"
ON public.owner_curations FOR ALL
USING (is_team_member(auth.uid()))
WITH CHECK (is_team_member(auth.uid()));

CREATE TRIGGER update_owner_curations_updated_at
BEFORE UPDATE ON public.owner_curations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_owner_curations_owner ON public.owner_curations(owner_id, status);
