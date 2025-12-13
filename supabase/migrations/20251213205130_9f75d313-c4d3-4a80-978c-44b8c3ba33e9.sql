-- Update can_view_ticket_type function to give maintenance access to everything except:
-- bloqueio_data, financeiro, conversar_hospedes, duvida
CREATE OR REPLACE FUNCTION public.can_view_ticket_type(_user_id uuid, _ticket_type ticket_type)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      -- Admin pode ver tudo
      WHEN EXISTS (SELECT 1 FROM profiles WHERE id = _user_id AND role = 'admin'::app_role) THEN true
      
      -- Manutenção pode ver tudo EXCETO: bloqueio_data, financeiro, conversar_hospedes, duvida
      WHEN EXISTS (SELECT 1 FROM profiles WHERE id = _user_id AND role = 'maintenance'::app_role) 
        AND _ticket_type NOT IN ('bloqueio_data', 'financeiro', 'conversar_hospedes', 'duvida') THEN true
      
      -- Equipe/Agent pode ver: duvida, informacao, conversar_hospedes, bloqueio_data
      WHEN EXISTS (SELECT 1 FROM profiles WHERE id = _user_id AND role = 'agent'::app_role) 
        AND _ticket_type IN ('duvida', 'informacao', 'conversar_hospedes', 'bloqueio_data') THEN true
      
      ELSE false
    END
$$;