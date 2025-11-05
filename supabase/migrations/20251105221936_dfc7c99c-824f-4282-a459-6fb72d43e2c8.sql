-- Add DELETE policy for team members (admin/agent) on tickets table
CREATE POLICY "Team can delete tickets"
ON public.tickets
FOR DELETE
TO authenticated
USING (is_team_member(auth.uid()));