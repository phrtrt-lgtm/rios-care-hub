ALTER TABLE public.contracts ALTER COLUMN template_id DROP NOT NULL;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS signed_pdf_path text;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS sent_to_owner_at timestamptz;