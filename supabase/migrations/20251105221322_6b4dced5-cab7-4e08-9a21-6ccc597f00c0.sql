-- Add cleaner role to app_role enum if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'agent', 'owner', 'pending_owner', 'cleaner');
  ELSE
    -- Add cleaner to existing enum if not present
    BEGIN
      ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cleaner';
    EXCEPTION WHEN OTHERS THEN
      -- Value already exists, continue
      NULL;
    END;
  END IF;
END $$;

-- Add assigned_cleaner_id column to properties table
ALTER TABLE public.properties 
ADD COLUMN IF NOT EXISTS assigned_cleaner_id uuid REFERENCES public.profiles(id);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_properties_assigned_cleaner 
ON public.properties(assigned_cleaner_id);

-- Add comment
COMMENT ON COLUMN public.properties.assigned_cleaner_id IS 'Reference to the cleaner (user with cleaner role) assigned to this property';