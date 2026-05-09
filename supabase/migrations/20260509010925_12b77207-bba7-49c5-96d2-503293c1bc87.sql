ALTER TABLE public.owner_curations
ADD COLUMN IF NOT EXISTS selected_items jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS purchase_ticket_id uuid;