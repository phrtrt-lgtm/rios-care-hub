-- Drop existing constraint and add updated one with all valid values
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_kind_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_kind_check CHECK (kind = ANY (ARRAY['support'::text, 'maintenance'::text, 'internal'::text]));