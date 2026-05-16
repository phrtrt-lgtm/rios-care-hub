
CREATE OR REPLACE FUNCTION public.auto_set_paid_status_on_paid_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new_status TEXT;
BEGIN
  -- Only act if paid_at is set and current status is not already a final/paid status
  IF NEW.paid_at IS NOT NULL
     AND NEW.status NOT IN ('pago_antecipado','pago_no_vencimento','pago_com_atraso','arquivado','debited','cancelled') THEN

    IF NEW.due_date IS NULL THEN
      v_new_status := 'pago_no_vencimento';
    ELSIF NEW.paid_at::date <= NEW.due_date - INTERVAL '2 days' THEN
      v_new_status := 'pago_antecipado';
    ELSIF NEW.paid_at::date <= NEW.due_date THEN
      v_new_status := 'pago_no_vencimento';
    ELSE
      v_new_status := 'pago_com_atraso';
    END IF;

    NEW.status := v_new_status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_set_paid_status_on_paid_at ON public.charges;
CREATE TRIGGER trg_auto_set_paid_status_on_paid_at
BEFORE INSERT OR UPDATE OF paid_at, status ON public.charges
FOR EACH ROW
EXECUTE FUNCTION public.auto_set_paid_status_on_paid_at();
