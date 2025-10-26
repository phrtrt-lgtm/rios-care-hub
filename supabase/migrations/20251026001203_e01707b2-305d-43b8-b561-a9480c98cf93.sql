-- Fix function search path for set_ticket_sla
DROP TRIGGER IF EXISTS set_ticket_sla_trigger ON public.tickets;
DROP FUNCTION IF EXISTS public.set_ticket_sla();

CREATE OR REPLACE FUNCTION public.set_ticket_sla()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.priority = 'urgente' THEN
    NEW.sla_due_at = NEW.created_at + INTERVAL '6 hours';
  ELSE
    NEW.sla_due_at = NEW.created_at + INTERVAL '24 hours';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_ticket_sla_trigger
  BEFORE INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ticket_sla();