-- Tabela de profissionais/prestadores de serviço
CREATE TABLE public.service_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  specialty TEXT[], -- Array: hidraulica, eletrica, marcenaria, etc.
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.service_providers ENABLE ROW LEVEL SECURITY;

-- Apenas equipe pode gerenciar profissionais
CREATE POLICY "Team can manage service providers"
ON public.service_providers
FOR ALL
USING (is_team_member(auth.uid()));

-- Trigger para atualizar updated_at
CREATE TRIGGER update_service_providers_updated_at
BEFORE UPDATE ON public.service_providers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Adicionar campos de agendamento nos tickets
ALTER TABLE public.tickets
ADD COLUMN scheduled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN service_provider_id UUID REFERENCES public.service_providers(id) ON DELETE SET NULL;

-- Índices para performance
CREATE INDEX idx_tickets_scheduled_at ON public.tickets(scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX idx_tickets_maintenance ON public.tickets(ticket_type, status) WHERE ticket_type = 'manutencao';
CREATE INDEX idx_service_providers_active ON public.service_providers(is_active) WHERE is_active = true;