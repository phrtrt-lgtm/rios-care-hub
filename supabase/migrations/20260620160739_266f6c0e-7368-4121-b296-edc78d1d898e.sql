
-- Add sent_at to charges
ALTER TABLE public.charges ADD COLUMN IF NOT EXISTS sent_at timestamptz;

-- Backfill sent_at for already non-draft charges (assume sent at created_at as best estimate)
UPDATE public.charges SET sent_at = created_at WHERE sent_at IS NULL AND status <> 'draft';

-- Replace due-date trigger function: only set due_date when charge is not draft, based on sent_at
CREATE OR REPLACE FUNCTION public.set_charge_due_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'draft' THEN
      -- Rascunho não tem vencimento ainda
      RETURN NEW;
    END IF;
    IF NEW.sent_at IS NULL THEN
      NEW.sent_at := COALESCE(NEW.created_at, now());
    END IF;
    IF NEW.due_date IS NULL THEN
      NEW.due_date := (NEW.sent_at + INTERVAL '7 days')::date;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Transição de rascunho para enviada: registrar sent_at e (re)calcular due_date
    IF OLD.status = 'draft' AND NEW.status <> 'draft' THEN
      IF NEW.sent_at IS NULL OR NEW.sent_at = OLD.sent_at THEN
        NEW.sent_at := now();
      END IF;
      -- Recalcula due_date se não foi alterado manualmente nesta atualização
      IF NEW.due_date IS NULL OR NEW.due_date = OLD.due_date THEN
        NEW.due_date := (NEW.sent_at + INTERVAL '7 days')::date;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Recreate trigger to fire on INSERT and UPDATE
DROP TRIGGER IF EXISTS set_charge_due_date_trigger ON public.charges;
CREATE TRIGGER set_charge_due_date_trigger
BEFORE INSERT OR UPDATE ON public.charges
FOR EACH ROW EXECUTE FUNCTION public.set_charge_due_date();
