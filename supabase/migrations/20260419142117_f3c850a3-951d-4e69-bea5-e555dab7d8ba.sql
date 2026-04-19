ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_properties_archived_at ON public.properties(archived_at);
UPDATE public.properties SET archived_at = now() WHERE id = '6fe1bfc0-6eb1-4b40-bf3e-17d3727f59b8';