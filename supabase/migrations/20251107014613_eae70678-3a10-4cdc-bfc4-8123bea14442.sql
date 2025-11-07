-- Criar função para verificar se um usuário pode visualizar um tipo de ticket
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
      
      -- Manutenção pode ver: duvida, informacao, bloqueio_data, manutencao, cobranca
      WHEN EXISTS (SELECT 1 FROM profiles WHERE id = _user_id AND role = 'maintenance'::app_role) 
        AND _ticket_type IN ('duvida', 'informacao', 'bloqueio_data', 'manutencao', 'cobranca') THEN true
      
      -- Equipe/Agent pode ver: duvida, informacao, conversar_hospedes, bloqueio_data
      WHEN EXISTS (SELECT 1 FROM profiles WHERE id = _user_id AND role = 'agent'::app_role) 
        AND _ticket_type IN ('duvida', 'informacao', 'conversar_hospedes', 'bloqueio_data') THEN true
      
      ELSE false
    END
$$;

-- Atualizar políticas RLS para tickets
DROP POLICY IF EXISTS "Team can view all tickets" ON public.tickets;
DROP POLICY IF EXISTS "admins_agents_can_view_tickets" ON public.tickets;

-- Nova política para equipe visualizar tickets baseado no tipo
CREATE POLICY "Team can view tickets by type"
ON public.tickets
FOR SELECT
TO authenticated
USING (
  is_team_member(auth.uid()) 
  AND can_view_ticket_type(auth.uid(), ticket_type)
);