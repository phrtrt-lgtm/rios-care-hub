-- Add video metadata fields to charge_attachments
ALTER TABLE public.charge_attachments 
ADD COLUMN IF NOT EXISTS poster_path text,
ADD COLUMN IF NOT EXISTS duration_sec integer,
ADD COLUMN IF NOT EXISTS width integer,
ADD COLUMN IF NOT EXISTS height integer;