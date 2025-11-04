-- ========================================
-- SISTEMA DE MANUTENÇÕES
-- ========================================

-- 1) Tabela principal de manutenções
CREATE TABLE IF NOT EXISTS public.maintenances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT, -- 'elétrica','hidráulica','ar_condicionado','marcenaria','pintura','eletrodoméstico','limpeza','outros'
  status TEXT NOT NULL DEFAULT 'open', -- 'open'|'in_progress'|'completed'|'paid'|'cancelled'
  cost_total_cents INTEGER NOT NULL DEFAULT 0 CHECK (cost_total_cents >= 0),
  cost_responsible TEXT NOT NULL DEFAULT 'owner', -- 'owner'|'management'|'split'
  split_owner_percent INTEGER CHECK (split_owner_percent IS NULL OR (split_owner_percent BETWEEN 0 AND 100)),
  -- datas
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  due_at DATE,
  -- metadados
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_maint_owner ON public.maintenances(owner_id);
CREATE INDEX idx_maint_property ON public.maintenances(property_id);
CREATE INDEX idx_maint_status ON public.maintenances(status);
CREATE INDEX idx_maint_due ON public.maintenances(due_at);
CREATE INDEX idx_maint_opened ON public.maintenances(opened_at);

-- 2) Tabela de pagamentos
CREATE TABLE IF NOT EXISTS public.maintenance_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_id UUID NOT NULL REFERENCES public.maintenances(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  payment_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  method TEXT DEFAULT 'pix', -- 'pix'|'boleto'|'cartao'|'transfer'|'dinheiro'|'outro'
  applies_to TEXT NOT NULL DEFAULT 'total', -- 'total'|'owner_share'|'management_share'
  proof_file_url TEXT,
  note TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mpay_maintenance ON public.maintenance_payments(maintenance_id);
CREATE INDEX idx_mpay_date ON public.maintenance_payments(payment_date);

-- 3) Tabela de anexos
CREATE TABLE IF NOT EXISTS public.maintenance_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_id UUID NOT NULL REFERENCES public.maintenances(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT,
  file_type TEXT,
  size_bytes INTEGER,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_matt_maintenance ON public.maintenance_attachments(maintenance_id);

-- 4) Tabela de eventos (audit trail)
CREATE TABLE IF NOT EXISTS public.maintenance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_id UUID NOT NULL REFERENCES public.maintenances(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'created'|'updated'|'status_changed'|'payment_added'|'payment_deleted'|'attachment_added'
  metadata JSONB DEFAULT '{}'::jsonb,
  actor_id UUID REFERENCES public.profiles(id),
  actor_role TEXT, -- 'admin'|'agent'|'owner'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mevt_maintenance ON public.maintenance_events(maintenance_id);
CREATE INDEX idx_mevt_created ON public.maintenance_events(created_at);

-- Trigger para updated_at
CREATE TRIGGER update_maintenances_updated_at
  BEFORE UPDATE ON public.maintenances
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ========================================
-- ROW LEVEL SECURITY POLICIES
-- ========================================

-- MAINTENANCES
ALTER TABLE public.maintenances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their maintenances"
  ON public.maintenances FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Team can view all maintenances"
  ON public.maintenances FOR SELECT
  USING (is_team_member(auth.uid()));

CREATE POLICY "Owners can create their maintenances"
  ON public.maintenances FOR INSERT
  WITH CHECK (auth.uid() = owner_id AND auth.uid() = created_by);

CREATE POLICY "Team can create maintenances"
  ON public.maintenances FOR INSERT
  WITH CHECK (is_team_member(auth.uid()));

CREATE POLICY "Team can update maintenances"
  ON public.maintenances FOR UPDATE
  USING (is_team_member(auth.uid()));

-- MAINTENANCE_PAYMENTS
ALTER TABLE public.maintenance_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view payments from their maintenances"
  ON public.maintenance_payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.maintenances m
      WHERE m.id = maintenance_payments.maintenance_id
        AND (m.owner_id = auth.uid() OR is_team_member(auth.uid()))
    )
  );

CREATE POLICY "Owners can add payments to their maintenances"
  ON public.maintenance_payments FOR INSERT
  WITH CHECK (
    auth.uid() = created_by AND
    EXISTS (
      SELECT 1 FROM public.maintenances m
      WHERE m.id = maintenance_payments.maintenance_id
        AND m.owner_id = auth.uid()
    )
  );

CREATE POLICY "Team can add payments"
  ON public.maintenance_payments FOR INSERT
  WITH CHECK (is_team_member(auth.uid()));

CREATE POLICY "Team can delete payments"
  ON public.maintenance_payments FOR DELETE
  USING (is_team_member(auth.uid()));

-- MAINTENANCE_ATTACHMENTS
ALTER TABLE public.maintenance_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view attachments from their maintenances"
  ON public.maintenance_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.maintenances m
      WHERE m.id = maintenance_attachments.maintenance_id
        AND (m.owner_id = auth.uid() OR is_team_member(auth.uid()))
    )
  );

CREATE POLICY "Users can add attachments to their maintenances"
  ON public.maintenance_attachments FOR INSERT
  WITH CHECK (
    auth.uid() = created_by AND
    EXISTS (
      SELECT 1 FROM public.maintenances m
      WHERE m.id = maintenance_attachments.maintenance_id
        AND (m.owner_id = auth.uid() OR is_team_member(auth.uid()))
    )
  );

CREATE POLICY "Team can delete attachments"
  ON public.maintenance_attachments FOR DELETE
  USING (is_team_member(auth.uid()));

-- MAINTENANCE_EVENTS
ALTER TABLE public.maintenance_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view events from their maintenances"
  ON public.maintenance_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.maintenances m
      WHERE m.id = maintenance_events.maintenance_id
        AND (m.owner_id = auth.uid() OR is_team_member(auth.uid()))
    )
  );

CREATE POLICY "Anyone authenticated can create events"
  ON public.maintenance_events FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);