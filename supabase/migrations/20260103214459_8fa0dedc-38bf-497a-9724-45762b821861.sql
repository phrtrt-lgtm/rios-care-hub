-- Tabela para templates de respostas rápidas
CREATE TABLE public.response_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'geral',
  shortcut TEXT,
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.response_templates ENABLE ROW LEVEL SECURITY;

-- Políticas - apenas equipe pode gerenciar templates
CREATE POLICY "Team members can view templates"
  ON public.response_templates FOR SELECT
  USING (public.is_team_member(auth.uid()));

CREATE POLICY "Team members can create templates"
  ON public.response_templates FOR INSERT
  WITH CHECK (public.is_team_member(auth.uid()));

CREATE POLICY "Team members can update templates"
  ON public.response_templates FOR UPDATE
  USING (public.is_team_member(auth.uid()));

CREATE POLICY "Team members can delete templates"
  ON public.response_templates FOR DELETE
  USING (public.is_team_member(auth.uid()));

-- Trigger para updated_at
CREATE TRIGGER update_response_templates_updated_at
  BEFORE UPDATE ON public.response_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Índice para busca rápida
CREATE INDEX idx_response_templates_category ON public.response_templates(category);
CREATE INDEX idx_response_templates_shortcut ON public.response_templates(shortcut);