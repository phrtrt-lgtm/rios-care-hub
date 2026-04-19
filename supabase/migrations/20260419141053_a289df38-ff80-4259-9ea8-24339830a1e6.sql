
-- Tabela principal: uma ficha por imóvel
CREATE TABLE public.property_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL UNIQUE REFERENCES public.properties(id) ON DELETE CASCADE,
  content_md TEXT NOT NULL DEFAULT '',
  summary TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_property_files_property_id ON public.property_files(property_id);

-- Tabela de histórico de versões
CREATE TABLE public.property_file_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_file_id UUID NOT NULL REFERENCES public.property_files(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content_md TEXT NOT NULL,
  change_reason TEXT,
  edited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_property_file_versions_file_id ON public.property_file_versions(property_file_id);
CREATE INDEX idx_property_file_versions_property_id ON public.property_file_versions(property_id);

-- RLS
ALTER TABLE public.property_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_file_versions ENABLE ROW LEVEL SECURITY;

-- Apenas equipe interna acessa fichas
CREATE POLICY "Team can view property files"
ON public.property_files FOR SELECT
USING (public.is_team_member(auth.uid()));

CREATE POLICY "Team can insert property files"
ON public.property_files FOR INSERT
WITH CHECK (public.is_team_member(auth.uid()));

CREATE POLICY "Team can update property files"
ON public.property_files FOR UPDATE
USING (public.is_team_member(auth.uid()))
WITH CHECK (public.is_team_member(auth.uid()));

CREATE POLICY "Team can delete property files"
ON public.property_files FOR DELETE
USING (public.is_team_member(auth.uid()));

-- Apenas equipe interna acessa histórico
CREATE POLICY "Team can view property file versions"
ON public.property_file_versions FOR SELECT
USING (public.is_team_member(auth.uid()));

CREATE POLICY "Team can insert property file versions"
ON public.property_file_versions FOR INSERT
WITH CHECK (public.is_team_member(auth.uid()));

-- Trigger: salvar versão antiga no histórico antes de cada UPDATE
CREATE OR REPLACE FUNCTION public.archive_property_file_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só arquiva se o conteúdo mudou
  IF OLD.content_md IS DISTINCT FROM NEW.content_md THEN
    INSERT INTO public.property_file_versions (
      property_file_id, property_id, version, content_md, edited_by
    ) VALUES (
      OLD.id, OLD.property_id, OLD.version, OLD.content_md, OLD.updated_by
    );
    NEW.version := OLD.version + 1;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_archive_property_file_version
BEFORE UPDATE ON public.property_files
FOR EACH ROW
EXECUTE FUNCTION public.archive_property_file_version();

-- Trigger updated_at no INSERT (não precisa, default já cobre)
