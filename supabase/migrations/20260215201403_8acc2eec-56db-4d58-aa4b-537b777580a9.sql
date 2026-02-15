
-- Table to store iCal links per property (from channel manager)
CREATE TABLE public.property_ical_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  ical_url TEXT NOT NULL,
  source_label TEXT DEFAULT 'channel_manager',
  last_synced_at TIMESTAMPTZ,
  sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(property_id, ical_url)
);

ALTER TABLE public.property_ical_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ical links" ON public.property_ical_links
  FOR ALL USING (public.is_admin_or_maintenance(auth.uid()));

CREATE POLICY "Owners can view their property ical links" ON public.property_ical_links
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.properties p 
      WHERE p.id = property_ical_links.property_id AND p.owner_id = auth.uid()
    )
  );

CREATE TRIGGER update_property_ical_links_updated_at
  BEFORE UPDATE ON public.property_ical_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table to store parsed reservations from iCal
CREATE TABLE public.reservations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  ical_link_id UUID REFERENCES public.property_ical_links(id) ON DELETE SET NULL,
  ical_uid TEXT,
  summary TEXT,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  guest_name TEXT,
  status TEXT DEFAULT 'confirmed',
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(property_id, ical_uid)
);

ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage reservations" ON public.reservations
  FOR ALL USING (public.is_admin_or_maintenance(auth.uid()));

CREATE POLICY "Owners can view their reservations" ON public.reservations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.properties p 
      WHERE p.id = reservations.property_id AND p.owner_id = auth.uid()
    )
  );

CREATE TRIGGER update_reservations_updated_at
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table to store AI-generated service summaries
CREATE TABLE public.service_availability_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_type TEXT NOT NULL, -- 'pintura', 'hidraulica', 'eletrica', etc.
  report_data JSONB NOT NULL, -- structured AI output
  shopping_list JSONB, -- shopping items per property
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.service_availability_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage reports" ON public.service_availability_reports
  FOR ALL USING (public.is_admin_or_maintenance(auth.uid()));

-- Enable realtime for reservations
ALTER PUBLICATION supabase_realtime ADD TABLE public.reservations;
