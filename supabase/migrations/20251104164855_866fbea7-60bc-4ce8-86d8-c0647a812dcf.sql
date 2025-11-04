-- Create function to set default due date
CREATE OR REPLACE FUNCTION public.set_charge_due_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- If due_date is not provided, set it to 7 days after created_at
  IF NEW.due_date IS NULL THEN
    NEW.due_date = (NEW.created_at + INTERVAL '7 days')::date;
  END IF;
  RETURN NEW;
END;
$function$;

-- Create trigger to auto-set due date on charge creation
DROP TRIGGER IF EXISTS set_charge_due_date_trigger ON public.charges;
CREATE TRIGGER set_charge_due_date_trigger
  BEFORE INSERT ON public.charges
  FOR EACH ROW
  EXECUTE FUNCTION public.set_charge_due_date();