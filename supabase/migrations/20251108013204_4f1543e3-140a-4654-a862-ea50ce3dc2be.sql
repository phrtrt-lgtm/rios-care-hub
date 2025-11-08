-- Allow team members to create proposal responses for any owner
CREATE POLICY "Team can create proposal responses"
ON proposal_responses
FOR INSERT
TO authenticated
WITH CHECK (is_team_member(auth.uid()));