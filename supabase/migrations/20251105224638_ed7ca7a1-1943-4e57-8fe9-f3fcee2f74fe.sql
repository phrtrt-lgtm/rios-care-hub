-- Allow team members (admin/agent) to update properties
CREATE POLICY "Team can update all properties"
ON properties
FOR UPDATE
TO authenticated
USING (is_team_member(auth.uid()))
WITH CHECK (is_team_member(auth.uid()));