-- Allow team members to delete proposals
CREATE POLICY "Team can delete proposals"
ON public.proposals
FOR DELETE
USING (is_team_member(auth.uid()));