-- Criar tabela para anexos de cobranças
CREATE TABLE IF NOT EXISTS public.charge_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  charge_id UUID REFERENCES public.charges(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) NOT NULL
);

-- Enable RLS
ALTER TABLE public.charge_attachments ENABLE ROW LEVEL SECURITY;

-- RLS policies para charge_attachments
CREATE POLICY "Team can upload charge attachments"
  ON public.charge_attachments
  FOR INSERT
  WITH CHECK (is_team_member(auth.uid()));

CREATE POLICY "Owners and team can view charge attachments"
  ON public.charge_attachments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.charges
      WHERE charges.id = charge_attachments.charge_id
      AND (charges.owner_id = auth.uid() OR is_team_member(auth.uid()))
    )
  );

-- Criar bucket para avatars se não existir
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies para avatars bucket
CREATE POLICY "Anyone can view avatars"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own avatar"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Atualizar política de tickets para impedir reabertura quando status é 'concluido' ou 'cancelado'
DROP POLICY IF EXISTS "Team can update tickets" ON public.tickets;

CREATE POLICY "Team can update tickets"
  ON public.tickets
  FOR UPDATE
  USING (
    is_team_member(auth.uid()) 
    AND status NOT IN ('concluido', 'cancelado')
  );