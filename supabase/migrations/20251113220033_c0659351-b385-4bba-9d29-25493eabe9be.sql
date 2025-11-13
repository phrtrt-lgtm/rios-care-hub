-- Criar tabela para anexos de pagamentos de manutenção
CREATE TABLE IF NOT EXISTS public.maintenance_payment_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id UUID NOT NULL REFERENCES public.charge_payments(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id)
);

-- Habilitar RLS
ALTER TABLE public.maintenance_payment_attachments ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Team can manage payment attachments"
  ON public.maintenance_payment_attachments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'agent')
    )
  );

CREATE POLICY "Owners can view their payment attachments"
  ON public.maintenance_payment_attachments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM charge_payments cp
      JOIN charges c ON c.id = cp.charge_id
      WHERE cp.id = maintenance_payment_attachments.payment_id
      AND c.owner_id = auth.uid()
    )
  );

-- Criar bucket de storage se não existir
INSERT INTO storage.buckets (id, name, public)
VALUES ('maintenance-payment-proofs', 'maintenance-payment-proofs', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage
CREATE POLICY "Team can upload payment proofs"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'maintenance-payment-proofs'
    AND (EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'agent', 'owner')
    ))
  );

CREATE POLICY "Team can view payment proofs"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'maintenance-payment-proofs'
    AND (EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'agent')
    ))
  );

CREATE POLICY "Owners can view their payment proofs"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'maintenance-payment-proofs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );