-- Add DELETE policy for charges table
CREATE POLICY "Team can delete charges" 
ON public.charges 
FOR DELETE 
USING (is_team_member(auth.uid()));