CREATE OR REPLACE FUNCTION public.auto_mark_charge_paid_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge RECORD;
  v_total_paid INTEGER;
  v_amount_due INTEGER;
  v_new_status TEXT;
  v_paid_at TIMESTAMPTZ;
BEGIN
  -- Buscar dados da cobrança
  SELECT id, amount_cents, management_contribution_cents, due_date, status, paid_at
    INTO v_charge
  FROM public.charges
  WHERE id = NEW.charge_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Não mexe em cobranças já arquivadas, debitadas ou canceladas
  IF v_charge.status IN ('arquivado', 'debited', 'cancelled') THEN
    RETURN NEW;
  END IF;

  -- Soma de todos os pagamentos registrados para essa cobrança
  SELECT COALESCE(SUM(amount_cents), 0)
    INTO v_total_paid
  FROM public.charge_payments
  WHERE charge_id = NEW.charge_id;

  -- Valor que o proprietário deve pagar (total - aporte da gestão)
  v_amount_due := v_charge.amount_cents - COALESCE(v_charge.management_contribution_cents, 0);

  -- Se ainda não cobriu o valor devido, não muda nada
  IF v_total_paid < v_amount_due THEN
    RETURN NEW;
  END IF;

  -- Definir paid_at como o momento do último pagamento (NEW.payment_date)
  v_paid_at := COALESCE(v_charge.paid_at, NEW.payment_date, now());

  -- Calcular status com base no timing do pagamento
  IF v_charge.due_date IS NULL THEN
    v_new_status := 'pago_no_vencimento';
  ELSIF v_paid_at::date <= v_charge.due_date - INTERVAL '2 days' THEN
    v_new_status := 'pago_antecipado';
  ELSIF v_paid_at::date <= v_charge.due_date THEN
    v_new_status := 'pago_no_vencimento';
  ELSE
    v_new_status := 'pago_com_atraso';
  END IF;

  -- Atualizar a cobrança apenas se o status atual não for já um status pago
  IF v_charge.status NOT IN ('pago_antecipado', 'pago_no_vencimento', 'pago_com_atraso') THEN
    UPDATE public.charges
    SET status = v_new_status,
        paid_at = v_paid_at,
        updated_at = now()
    WHERE id = NEW.charge_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_mark_charge_paid ON public.charge_payments;
CREATE TRIGGER trg_auto_mark_charge_paid
AFTER INSERT ON public.charge_payments
FOR EACH ROW
EXECUTE FUNCTION public.auto_mark_charge_paid_on_payment();