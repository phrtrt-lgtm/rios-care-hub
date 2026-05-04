CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.find_property_by_name_unaccent(_name text)
RETURNS TABLE(id uuid, owner_id uuid, name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT p.id, p.owner_id, p.name
  FROM public.properties p
  WHERE lower(unaccent(p.name)) = lower(unaccent(_name))
  LIMIT 10;
$$;