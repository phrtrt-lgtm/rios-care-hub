
-- Tabela para salvar rascunhos de vistoria na conta do usuário
CREATE TABLE public.inspection_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  form_type TEXT NOT NULL CHECK (form_type IN ('cleaner', 'team')),
  draft_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, property_id, form_type)
);

-- Enable RLS
ALTER TABLE public.inspection_drafts ENABLE ROW LEVEL SECURITY;

-- Usuários só acessam seus próprios rascunhos
CREATE POLICY "Users can view own drafts"
  ON public.inspection_drafts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own drafts"
  ON public.inspection_drafts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own drafts"
  ON public.inspection_drafts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own drafts"
  ON public.inspection_drafts FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE TRIGGER update_inspection_drafts_updated_at
  BEFORE UPDATE ON public.inspection_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
