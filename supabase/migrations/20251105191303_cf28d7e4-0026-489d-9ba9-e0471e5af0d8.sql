-- Add cover photo and cleaner assignment to properties
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS cover_photo_url text,
  ADD COLUMN IF NOT EXISTS assigned_cleaner_phone text;

-- Create cleaning inspections table
CREATE TABLE IF NOT EXISTS cleaning_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  cleaner_name text,
  cleaner_phone text,
  notes text,
  transcript text,
  audio_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  monday_item_id text
);

-- Create inspection attachments table
CREATE TABLE IF NOT EXISTS cleaning_inspection_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES cleaning_inspections(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text,
  file_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create inspection settings table (per property configuration)
CREATE TABLE IF NOT EXISTS inspection_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid UNIQUE NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  notify_owner boolean NOT NULL DEFAULT false,
  owner_portal_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_cleaning_inspections_property_created_at
  ON cleaning_inspections(property_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cleaning_inspection_attachments_inspection
  ON cleaning_inspection_attachments(inspection_id);

-- Enable RLS
ALTER TABLE cleaning_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaning_inspection_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for cleaning_inspections
CREATE POLICY "Team can view all inspections"
  ON cleaning_inspections FOR SELECT
  USING (is_team_member(auth.uid()));

CREATE POLICY "Team can create inspections"
  ON cleaning_inspections FOR INSERT
  WITH CHECK (is_team_member(auth.uid()));

CREATE POLICY "Owners can view inspections of their properties"
  ON cleaning_inspections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      INNER JOIN inspection_settings s ON s.property_id = p.id
      WHERE p.id = cleaning_inspections.property_id
      AND p.owner_id = auth.uid()
      AND s.owner_portal_enabled = true
    )
  );

-- RLS Policies for cleaning_inspection_attachments
CREATE POLICY "Team can view all attachments"
  ON cleaning_inspection_attachments FOR SELECT
  USING (is_team_member(auth.uid()));

CREATE POLICY "Team can create attachments"
  ON cleaning_inspection_attachments FOR INSERT
  WITH CHECK (is_team_member(auth.uid()));

CREATE POLICY "Owners can view attachments from their property inspections"
  ON cleaning_inspection_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM cleaning_inspections ci
      INNER JOIN properties p ON p.id = ci.property_id
      INNER JOIN inspection_settings s ON s.property_id = p.id
      WHERE ci.id = cleaning_inspection_attachments.inspection_id
      AND p.owner_id = auth.uid()
      AND s.owner_portal_enabled = true
    )
  );

-- RLS Policies for inspection_settings
CREATE POLICY "Team can manage inspection settings"
  ON inspection_settings FOR ALL
  USING (is_team_member(auth.uid()));

CREATE POLICY "Owners can view their property settings"
  ON inspection_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = inspection_settings.property_id
      AND properties.owner_id = auth.uid()
    )
  );