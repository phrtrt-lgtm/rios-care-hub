
-- Função para marcar cobranças como pagas quando aporte cobre 100%
CREATE OR REPLACE FUNCTION public.auto_pay_full_contribution_charges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Se o aporte da gestão cobre 100% do valor, marcar como pago automaticamente
  IF NEW.management_contribution_cents >= NEW.amount_cents THEN
    NEW.status = 'pago_no_vencimento';
    NEW.paid_at = COALESCE(NEW.paid_at, now());
  END IF;
  
  RETURN NEW;
END;
$$;

-- Criar trigger para INSERT e UPDATE
DROP TRIGGER IF EXISTS auto_pay_full_contribution ON charges;
CREATE TRIGGER auto_pay_full_contribution
  BEFORE INSERT OR UPDATE OF management_contribution_cents, amount_cents ON charges
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_pay_full_contribution_charges();

-- Atualizar cobranças existentes que já têm aporte total mas não foram marcadas como pagas
UPDATE charges 
SET status = 'pago_no_vencimento',
    paid_at = COALESCE(paid_at, now())
WHERE management_contribution_cents >= amount_cents 
  AND status NOT IN ('pago_no_vencimento', 'paid', 'cancelled');
