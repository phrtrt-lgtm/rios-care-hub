ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_compras_ticket_id ON public.compras(ticket_id);