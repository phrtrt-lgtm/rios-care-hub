
-- hostex_properties
CREATE TABLE public.hostex_properties (
  id_hostex TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  raw JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hostex_properties TO authenticated;
GRANT ALL ON public.hostex_properties TO service_role;
ALTER TABLE public.hostex_properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read hostex_properties" ON public.hostex_properties FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_hostex_properties_updated BEFORE UPDATE ON public.hostex_properties FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- hostex_reservations
CREATE TABLE public.hostex_reservations (
  reservation_code TEXT PRIMARY KEY,
  property_id_hostex TEXT,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  property_name TEXT,
  channel_type TEXT,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  nights INTEGER GENERATED ALWAYS AS (GREATEST(0, (check_out_date - check_in_date))) STORED,
  guests INTEGER,
  status TEXT,
  stay_status TEXT,
  guest_name TEXT,
  booked_at TIMESTAMPTZ,
  total_rate_cents INTEGER,
  total_commission_cents INTEGER,
  currency TEXT DEFAULT 'BRL',
  raw JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_hostex_res_dates ON public.hostex_reservations (check_in_date, check_out_date);
CREATE INDEX idx_hostex_res_property ON public.hostex_reservations (property_id);
CREATE INDEX idx_hostex_res_property_hx ON public.hostex_reservations (property_id_hostex);
CREATE INDEX idx_hostex_res_status ON public.hostex_reservations (status);
GRANT SELECT ON public.hostex_reservations TO authenticated;
GRANT ALL ON public.hostex_reservations TO service_role;
ALTER TABLE public.hostex_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read hostex_reservations" ON public.hostex_reservations FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_hostex_reservations_updated BEFORE UPDATE ON public.hostex_reservations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- hostex_sync_log
CREATE TABLE public.hostex_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  reservations_upserted INTEGER DEFAULT 0,
  properties_upserted INTEGER DEFAULT 0,
  reservations_cancelled INTEGER DEFAULT 0,
  error_message TEXT,
  triggered_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_hostex_sync_log_started ON public.hostex_sync_log (started_at DESC);
GRANT SELECT ON public.hostex_sync_log TO authenticated;
GRANT ALL ON public.hostex_sync_log TO service_role;
ALTER TABLE public.hostex_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read hostex_sync_log" ON public.hostex_sync_log FOR SELECT TO authenticated USING (true);
