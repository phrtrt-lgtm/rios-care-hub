-- Criar função auxiliar para verificar se é admin ou maintenance
CREATE OR REPLACE FUNCTION public.is_admin_or_maintenance(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = _user_id AND role IN ('admin', 'maintenance')
  )
$$;