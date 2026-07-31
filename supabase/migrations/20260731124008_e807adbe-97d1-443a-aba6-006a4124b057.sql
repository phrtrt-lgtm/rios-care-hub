CREATE OR REPLACE FUNCTION public.can_view_ticket_type(_user_id uuid, _ticket_type ticket_type)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    CASE
      WHEN EXISTS (SELECT 1 FROM profiles WHERE id = _user_id AND role = 'admin'::app_role) THEN true
      -- Manutenção passa a ver todos os tipos de chamado
      WHEN EXISTS (SELECT 1 FROM profiles WHERE id = _user_id AND role = 'maintenance'::app_role) THEN true
      WHEN EXISTS (SELECT 1 FROM profiles WHERE id = _user_id AND role = 'agent'::app_role)
        AND _ticket_type IN ('duvida', 'informacao', 'conversar_hospedes', 'bloqueio_data') THEN true
      ELSE false
    END
$function$;

DROP POLICY IF EXISTS tm_maintenance_all ON public.ticket_messages;
CREATE POLICY tm_maintenance_all ON public.ticket_messages FOR ALL TO authenticated
USING (has_role(auth.uid(), 'maintenance'::app_role))
WITH CHECK (has_role(auth.uid(), 'maintenance'::app_role));

DROP POLICY IF EXISTS ta_maintenance_all ON public.ticket_attachments;
CREATE POLICY ta_maintenance_all ON public.ticket_attachments FOR ALL TO authenticated
USING (has_role(auth.uid(), 'maintenance'::app_role))
WITH CHECK (has_role(auth.uid(), 'maintenance'::app_role));