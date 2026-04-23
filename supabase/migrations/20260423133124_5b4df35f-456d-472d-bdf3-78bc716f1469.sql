-- Adicionar campos de rastreabilidade à tabela notifications
-- Mantém compatibilidade com reference_id/reference_url existentes
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS link text,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid;

-- Índices para performance da central
CREATE INDEX IF NOT EXISTS idx_notifications_owner_created
  ON public.notifications(owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_owner_unread
  ON public.notifications(owner_id) WHERE read = false;