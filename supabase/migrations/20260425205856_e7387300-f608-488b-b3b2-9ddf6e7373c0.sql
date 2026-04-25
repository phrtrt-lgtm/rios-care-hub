-- Tabela para fichas de cadastro de potenciais proprietários
CREATE TABLE public.property_intake_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Dados do proprietário
  owner_name TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  owner_phone TEXT,
  owner_profile_id UUID, -- preenchido após criar conta auth
  
  -- Ficha técnica básica
  property_address TEXT NOT NULL,
  property_nickname TEXT, -- apelido/nome do imóvel
  bedrooms_count INTEGER NOT NULL DEFAULT 1,
  living_rooms_count INTEGER NOT NULL DEFAULT 1,
  bathrooms_count INTEGER NOT NULL DEFAULT 1,
  suites_count INTEGER NOT NULL DEFAULT 0,
  building_floors INTEGER, -- andares do prédio
  apartment_floor INTEGER, -- em qual andar fica
  property_levels INTEGER NOT NULL DEFAULT 1, -- pavimentos do imóvel
  has_elevator BOOLEAN NOT NULL DEFAULT false,
  has_wifi BOOLEAN NOT NULL DEFAULT true,
  max_capacity INTEGER NOT NULL DEFAULT 2,
  parking_spots INTEGER NOT NULL DEFAULT 0,
  
  -- Estrutura completa (JSON flexível)
  rooms_data JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{type:'bedroom', floor:1, beds:[{type:'queen', count:1}], hasAC:true, hasTV:true, hasBalcony:false}]
  kitchen_items JSONB NOT NULL DEFAULT '[]'::jsonb, -- ['airfryer','fogao','geladeira',...]
  special_amenities JSONB NOT NULL DEFAULT '[]'::jsonb, -- ['piscina','sauna','jacuzzi',...]
  condo_amenities JSONB NOT NULL DEFAULT '[]'::jsonb, -- ['portaria24h','academia',...]
  
  -- Mensagem livre (opcional)
  notes TEXT,
  
  -- Workflow
  status TEXT NOT NULL DEFAULT 'novo', -- novo | em_analise | reuniao_agendada | aprovado | rejeitado
  assigned_to UUID, -- admin responsável
  internal_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX idx_intake_status ON public.property_intake_submissions(status);
CREATE INDEX idx_intake_created ON public.property_intake_submissions(created_at DESC);
CREATE INDEX idx_intake_email ON public.property_intake_submissions(owner_email);

-- RLS
ALTER TABLE public.property_intake_submissions ENABLE ROW LEVEL SECURITY;

-- Qualquer pessoa pode submeter (público)
CREATE POLICY "Anyone can submit intake"
ON public.property_intake_submissions
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Apenas equipe vê
CREATE POLICY "Team can view intake submissions"
ON public.property_intake_submissions
FOR SELECT
TO authenticated
USING (public.is_team_member(auth.uid()));

-- Apenas equipe atualiza
CREATE POLICY "Team can update intake submissions"
ON public.property_intake_submissions
FOR UPDATE
TO authenticated
USING (public.is_team_member(auth.uid()))
WITH CHECK (public.is_team_member(auth.uid()));

-- Apenas admin deleta
CREATE POLICY "Admin can delete intake submissions"
ON public.property_intake_submissions
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Trigger updated_at
CREATE TRIGGER trg_intake_updated_at
BEFORE UPDATE ON public.property_intake_submissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();