-- PIX e link de pagamento guardados na cobrança valem só para o valor em que
-- foram gerados.
--
-- Em 2026-11-11 um proprietário selecionou cinco cobranças (R$ 711,66 na tela)
-- e o PIX saiu R$ 1.319,00: as functions de pagamento não descontavam o saldo
-- credor já abatido (`credit_applied_cents`). As functions foram corrigidas no
-- mesmo dia. Este trigger fecha a outra porta do mesmo erro: a cobrança que já
-- tinha PIX ou link guardado e depois mudou de valor a pagar (saldo credor
-- abatido, aporte da gestão alterado, valor corrigido). O dado guardado
-- continuaria sendo mostrado ao proprietário com o valor antigo.
--
-- Regra: mudou o valor a pagar (valor − aporte − crédito) de uma cobrança ainda
-- não paga, o PIX e o link guardados são apagados; a tela oferece gerar de novo,
-- já no valor certo. Cobrança paga não é tocada. `mercadopago_payment_id` fica:
-- é o registro do pagamento, não um meio de pagar.

create or replace function public.charges_limpar_pagamento_defasado()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_antes bigint := coalesce(old.amount_cents, 0)
    - coalesce(old.management_contribution_cents, 0)
    - coalesce(old.credit_applied_cents, 0);
  v_depois bigint := coalesce(new.amount_cents, 0)
    - coalesce(new.management_contribution_cents, 0)
    - coalesce(new.credit_applied_cents, 0);
begin
  if v_antes is distinct from v_depois and new.paid_at is null then
    new.payment_link := null;
    new.payment_link_url := null;
    new.mercadopago_preference_id := null;
    new.pix_qr_code := null;
    new.pix_qr_code_base64 := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_charges_limpar_pagamento_defasado on public.charges;

create trigger trg_charges_limpar_pagamento_defasado
  before update on public.charges
  for each row
  execute function public.charges_limpar_pagamento_defasado();

-- Links gerados antes da correção para cobranças em aberto que já tinham saldo
-- credor abatido: nasceram sem descontar o crédito, então estão no valor errado.
update public.charges
   set payment_link = null,
       payment_link_url = null,
       mercadopago_preference_id = null,
       pix_qr_code = null,
       pix_qr_code_base64 = null
 where coalesce(credit_applied_cents, 0) > 0
   and paid_at is null
   and status in ('sent', 'pendente', 'overdue')
   and (payment_link is not null or payment_link_url is not null or pix_qr_code is not null);
