
CREATE TABLE public.hostex_listing_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id text NOT NULL,
  channel_type text NOT NULL,
  property_id_hostex text,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  date date NOT NULL,
  price_cents integer,
  currency text DEFAULT 'BRL',
  inventory integer,
  min_stay integer,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, channel_type, date)
);
CREATE INDEX hostex_listing_calendar_property_date_idx
  ON public.hostex_listing_calendar (property_id_hostex, date);

GRANT SELECT ON public.hostex_listing_calendar TO authenticated;
GRANT ALL ON public.hostex_listing_calendar TO service_role;

ALTER TABLE public.hostex_listing_calendar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can read listing calendar"
  ON public.hostex_listing_calendar
  FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));
