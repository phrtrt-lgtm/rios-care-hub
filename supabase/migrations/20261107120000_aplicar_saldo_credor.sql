-- Saldo credor do proprietário passa a ser usado nas cobranças (pedido do gestor, 2026-11-07).
--
-- Antes: o crédito (`owner_credits`) só era aplicado no momento em que nascia
-- (`debit-reserve-now`, `credit-manual`). A sobra ficava parada para sempre:
-- Wanderson tinha R$ 284,63 desde 14/08 e duas cobranças de R$ 695,00 aguardando
-- débito em reserva, sem nenhum caminho para compensar.
--
-- Agora `aplicar_saldo_credor` consome os créditos abertos do proprietário
-- (o mais antigo primeiro) nas cobranças em aberto (o vencimento mais antigo
-- primeiro). Quem chama:
-- * o proprietário, escolhendo as cobranças em /minhas-cobrancas;
-- * a equipe, pelo botão "Abater" no saldo credor de /gerenciar-cobrancas;
-- * a calculadora de débito em reserva, sempre, antes de calcular: o saldo entra
--   na conta e não acumula.
--
-- Cobrança coberta por inteiro ganha `paid_at`; o trigger
-- `auto_set_paid_status_on_paid_at` escolhe o status de paga. O WhatsApp de
-- cobrança não dispara (o trigger só olha aporte da gestão).

create or replace function public.aplicar_saldo_credor(
  p_charge_ids uuid[] default null,
  p_owner_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_equipe boolean;
  v_owner uuid := p_owner_id;
  v_donos int;
  v_cobranca record;
  v_credito record;
  v_falta integer;
  v_usar integer;
  v_aplicado integer;
  v_total integer := 0;
  v_quitadas integer := 0;
  v_itens jsonb := '[]'::jsonb;
  v_saldo integer;
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;
  v_equipe := public.is_team_member(v_uid);

  if p_charge_ids is not null and cardinality(p_charge_ids) > 0 then
    select count(distinct owner_id), min(owner_id::text)::uuid
      into v_donos, v_owner
      from public.charges
     where id = any(p_charge_ids);
    if v_donos = 0 then
      raise exception 'Cobrança não encontrada.' using errcode = 'P0002';
    end if;
    if v_donos > 1 then
      raise exception 'As cobranças são de proprietários diferentes.' using errcode = '22023';
    end if;
    if p_owner_id is not null and p_owner_id <> v_owner then
      raise exception 'As cobranças não são deste proprietário.' using errcode = '22023';
    end if;
  elsif v_owner is null then
    v_owner := v_uid;
  end if;

  if not v_equipe and v_owner <> v_uid then
    raise exception 'Sem permissão para usar este saldo.' using errcode = '42501';
  end if;

  for v_cobranca in
    select id,
           amount_cents,
           coalesce(management_contribution_cents, 0) as aporte,
           coalesce(credit_applied_cents, 0) as credito
      from public.charges
     where owner_id = v_owner
       and (p_charge_ids is null or cardinality(p_charge_ids) = 0 or id = any(p_charge_ids))
       and archived_at is null
       and paid_at is null
       and debited_at is null
       and status in ('sent', 'pendente', 'overdue', 'aguardando_reserva')
     order by due_date nulls last, created_at
     for update
  loop
    v_falta := greatest(0, v_cobranca.amount_cents - v_cobranca.aporte - v_cobranca.credito);
    continue when v_falta = 0;

    v_aplicado := 0;
    for v_credito in
      select id, remaining_amount_cents
        from public.owner_credits
       where owner_id = v_owner
         and status = 'open'
         and remaining_amount_cents > 0
       order by created_at
       for update
    loop
      exit when v_falta = 0;
      v_usar := least(v_falta, v_credito.remaining_amount_cents);

      update public.owner_credits
         set remaining_amount_cents = remaining_amount_cents - v_usar,
             status = case when remaining_amount_cents - v_usar = 0 then 'consumed' else status end
       where id = v_credito.id;

      insert into public.owner_credit_applications (credit_id, charge_id, amount_applied_cents, applied_by)
      values (v_credito.id, v_cobranca.id, v_usar, v_uid);

      v_falta := v_falta - v_usar;
      v_aplicado := v_aplicado + v_usar;
    end loop;

    -- Acabou o saldo: as próximas cobranças também não receberiam nada.
    exit when v_aplicado = 0;

    update public.charges
       set credit_applied_cents = v_cobranca.credito + v_aplicado,
           paid_at = case when v_falta = 0 then now() else paid_at end
     where id = v_cobranca.id;

    v_total := v_total + v_aplicado;
    if v_falta = 0 then
      v_quitadas := v_quitadas + 1;
    end if;
    v_itens := v_itens || jsonb_build_object(
      'id', v_cobranca.id,
      'aplicado_cents', v_aplicado,
      'restante_cents', v_falta,
      'quitada', v_falta = 0
    );
  end loop;

  select coalesce(sum(remaining_amount_cents), 0)::integer
    into v_saldo
    from public.owner_credits
   where owner_id = v_owner and status = 'open';

  -- A equipe abateu: o proprietário fica sabendo. Quando é ele quem escolhe, não precisa.
  if v_total > 0 and v_owner <> v_uid then
    insert into public.notifications (owner_id, title, message, type, reference_url)
    values (
      v_owner,
      'Saldo credor usado nas suas cobranças',
      format('Abatemos R$ %s do seu saldo credor em %s cobrança(s).%s',
             replace(to_char(v_total / 100.0, 'FM9999990.00'), '.', ','),
             jsonb_array_length(v_itens),
             case when v_saldo > 0
                  then format(' Ainda restam R$ %s de saldo.', replace(to_char(v_saldo / 100.0, 'FM9999990.00'), '.', ','))
                  else '' end),
      'charge',
      '/minhas-cobrancas'
    );
  end if;

  return jsonb_build_object(
    'owner_id', v_owner,
    'aplicado_cents', v_total,
    'quitadas', v_quitadas,
    'saldo_restante_cents', v_saldo,
    'cobrancas', v_itens
  );
end;
$$;

revoke all on function public.aplicar_saldo_credor(uuid[], uuid) from public, anon;
grant execute on function public.aplicar_saldo_credor(uuid[], uuid) to authenticated;
