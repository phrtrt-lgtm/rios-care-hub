-- Add cleaner role to app_role enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'cleaner';

-- Create RLS policy for cleaners to view their own profile
CREATE POLICY "Cleaners can view their own profile"
ON profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id AND role = 'cleaner');