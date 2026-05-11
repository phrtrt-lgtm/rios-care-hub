CREATE OR REPLACE FUNCTION public.auto_pay_full_contribution_charges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Só auto-paga quando há valor real cobrado (amount > 0) e o aporte cobre 100%.
  -- Evita marcar como paga uma cobrança recém-criada/rascunho com amount_cents=0.
  IF NEW.amount_cents > 0 AND NEW.management_contribution_cents >= NEW.amount_cents THEN
    NEW.status = 'pago_no_vencimento';
    NEW.paid_at = COALESCE(NEW.paid_at, now());
  END IF;

  RETURN NEW;
END;
$function$;