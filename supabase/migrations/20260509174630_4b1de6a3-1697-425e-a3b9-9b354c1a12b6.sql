
CREATE TABLE IF NOT EXISTS public.curation_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  owner_id uuid NOT NULL,
  curation_id uuid,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS curation_access_tokens_token_idx ON public.curation_access_tokens(token);
ALTER TABLE public.curation_access_tokens ENABLE ROW LEVEL SECURITY;
-- No public policies; only service role accesses this table.
