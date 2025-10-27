-- Add policy for team members to insert properties
CREATE POLICY "Team can insert properties for any owner"
ON public.properties
FOR INSERT
TO authenticated
WITH CHECK (is_team_member(auth.uid()));