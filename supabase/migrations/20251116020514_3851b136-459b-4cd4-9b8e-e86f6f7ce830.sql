-- Drop the existing constraint
ALTER TABLE public.properties 
DROP CONSTRAINT IF EXISTS properties_assigned_cleaner_id_fkey;

-- Recreate it with ON DELETE SET NULL
ALTER TABLE public.properties 
ADD CONSTRAINT properties_assigned_cleaner_id_fkey 
FOREIGN KEY (assigned_cleaner_id) 
REFERENCES public.profiles(id) 
ON DELETE SET NULL;