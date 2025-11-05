-- Allow cleaners to view properties assigned to them
CREATE POLICY "Cleaners can view their assigned properties"
ON properties
FOR SELECT
TO authenticated
USING (
  auth.uid() = assigned_cleaner_id
);