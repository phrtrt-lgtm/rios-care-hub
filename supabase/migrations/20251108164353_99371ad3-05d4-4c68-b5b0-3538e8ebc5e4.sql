-- Atualizar RLS policies de inspeções para permitir visualização por toda a equipe

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Team can view all inspections" ON cleaning_inspections;
DROP POLICY IF EXISTS "Team can create inspections" ON cleaning_inspections;
DROP POLICY IF EXISTS "Team can view all attachments" ON cleaning_inspection_attachments;
DROP POLICY IF EXISTS "Team can create attachments" ON cleaning_inspection_attachments;
DROP POLICY IF EXISTS "Team can manage inspection settings" ON inspection_settings;

-- Cleaning inspections: All team members (admin, agent, maintenance) can view
CREATE POLICY "All team members can view inspections"
ON cleaning_inspections
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() 
    AND role IN ('admin', 'agent', 'maintenance')
  )
);

-- Cleaning inspections: Team can create (existing policy was OK, recreating for clarity)
CREATE POLICY "Team can create inspections"
ON cleaning_inspections
FOR INSERT
TO authenticated
WITH CHECK (is_team_member(auth.uid()));

-- Cleaning inspection attachments: All team members can view
CREATE POLICY "All team members can view inspection attachments"
ON cleaning_inspection_attachments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() 
    AND role IN ('admin', 'agent', 'maintenance')
  )
);

-- Cleaning inspection attachments: Team can create
CREATE POLICY "Team can create inspection attachments"
ON cleaning_inspection_attachments
FOR INSERT
TO authenticated
WITH CHECK (is_team_member(auth.uid()));

-- Inspection settings: All team members can view and manage
CREATE POLICY "All team members can manage inspection settings"
ON inspection_settings
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() 
    AND role IN ('admin', 'agent', 'maintenance')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() 
    AND role IN ('admin', 'agent', 'maintenance')
  )
);