CREATE OR REPLACE FUNCTION public.find_property_by_name_unaccent(_name text)
 RETURNS TABLE(id uuid, owner_id uuid, name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT p.id, p.owner_id, p.name
  FROM public.properties p
  WHERE regexp_replace(lower(unaccent(p.name)), '\s+', '', 'g')
      = regexp_replace(lower(unaccent(_name)), '\s+', '', 'g')
  LIMIT 10;
$function$;