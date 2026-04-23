-- Adicionar campo de vínculo entre fotos de vistoria e tickets de manutenção
ALTER TABLE public.cleaning_inspection_attachments
  ADD COLUMN IF NOT EXISTS maintenance_ticket_id uuid
    REFERENCES public.tickets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cia_maintenance_ticket
  ON public.cleaning_inspection_attachments(maintenance_ticket_id)
  WHERE maintenance_ticket_id IS NOT NULL;