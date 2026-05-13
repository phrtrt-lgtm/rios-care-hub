-- Recria o trigger que marca a cobrança como paga automaticamente
-- quando o total dos pagamentos cobre o valor devido pelo proprietário.
-- A função `auto_mark_charge_paid_on_payment` já existia no banco,
-- mas o trigger que a invoca havia sido removido em algum momento,
-- fazendo com que pagamentos agrupados (Mercado Pago) registrassem
-- o `charge_payment` mas não atualizassem o status da cobrança.

DROP TRIGGER IF EXISTS trg_auto_mark_charge_paid ON public.charge_payments;

CREATE TRIGGER trg_auto_mark_charge_paid
AFTER INSERT ON public.charge_payments
FOR EACH ROW
EXECUTE FUNCTION public.auto_mark_charge_paid_on_payment();

-- Também recria o trigger BEFORE INSERT/UPDATE em charges que auto-paga
-- cobranças cujo aporte da gestão cobre 100% do valor.
DROP TRIGGER IF EXISTS trg_auto_pay_full_contribution ON public.charges;

CREATE TRIGGER trg_auto_pay_full_contribution
BEFORE INSERT OR UPDATE OF amount_cents, management_contribution_cents ON public.charges
FOR EACH ROW
EXECUTE FUNCTION public.auto_pay_full_contribution_charges();