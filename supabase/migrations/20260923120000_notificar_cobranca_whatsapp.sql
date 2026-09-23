-- Notificação de cobrança por WhatsApp — 2026-09-23
-- Idempotente: pode rodar mais de uma vez sem efeito colateral.
--
-- Fluxo: trigger em charges detecta a transição "virou cobrança" e chama a
-- edge function notificar-cobranca via pg_net, autenticando com um token
-- gerado aqui dentro e guardado no Vault. A function consulta o switch do
-- proprietário, chama a função central de WhatsApp e grava o resultado.

-- 1. Switch por proprietário (todos começam DESLIGADOS) -----------------------
alter table public.profiles
  add column if not exists notificar_whatsapp boolean not null default false;

comment on column public.profiles.notificar_whatsapp is
  'Proprietário recebe WhatsApp quando uma cobrança é enviada. Só a equipe altera (ver prevent_self_privilege_escalation). Número = profiles.phone.';

-- 2. Resultado do envio na cobrança -------------------------------------------
alter table public.charges
  add column if not exists whatsapp_status text,
  add column if not exists whatsapp_enviado_em timestamptz,
  add column if not exists whatsapp_message_id text,
  add column if not exists whatsapp_erro text;

alter table public.charges drop constraint if exists charges_whatsapp_status_check;
alter table public.charges add constraint charges_whatsapp_status_check
  check (whatsapp_status is null or whatsapp_status in ('enviado', 'falhou', 'desativado'));

-- 3. Auto-pagamento com 100% de aporte não age mais sobre rascunho ------------
-- Antes, digitar um aporte >= valor num rascunho já marcava a cobrança como
-- paga — antes de alguém clicar em "Enviar". Com o WhatsApp disparando na
-- transição para paga-por-aporte, isso notificaria o proprietário no meio da
-- edição. Agora o rascunho segue rascunho até ser enviado; no envio, auto-paga.
create or replace function public.auto_pay_full_contribution_charges()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Só auto-paga quando há valor real cobrado (amount > 0), o aporte cobre 100%
  -- e a cobrança já saiu do rascunho.
  if NEW.status <> 'draft'
     and NEW.amount_cents > 0
     and NEW.management_contribution_cents >= NEW.amount_cents then
    NEW.status = 'pago_no_vencimento';
    NEW.paid_at = coalesce(NEW.paid_at, now());
  end if;
  return NEW;
end;
$function$;

-- 4. Proprietário não liga o próprio switch -----------------------------------
create or replace function public.prevent_self_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.has_role(auth.uid(), 'admin') then
    return new;
  end if;

  if auth.uid() = old.id then
    if new.role is distinct from old.role then
      raise exception 'Alteracao de papel nao permitida.' using errcode = '42501';
    end if;
    if new.status is distinct from old.status then
      raise exception 'Alteracao de status nao permitida.' using errcode = '42501';
    end if;
    if new.payment_score is distinct from old.payment_score then
      raise exception 'Alteracao de score nao permitida.' using errcode = '42501';
    end if;
    if new.curation_only is distinct from old.curation_only then
      raise exception 'Alteracao de acesso restrito nao permitida.' using errcode = '42501';
    end if;
    if new.notificar_whatsapp is distinct from old.notificar_whatsapp then
      raise exception 'Alteracao de notificacao por WhatsApp nao permitida.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- 5. Token interno trigger -> function, gerado aqui e guardado no Vault -------
-- Ninguém precisa conhecer o valor: o trigger lê do Vault e a function confere
-- via verificar_token_interno(), executável só pela service role.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'notificar_cobranca_token') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'notificar_cobranca_token',
      'Autentica o trigger de charges na edge function notificar-cobranca'
    );
  end if;
end $$;

create or replace function public.verificar_token_interno(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public, vault
as $$
  select p_token is not null and exists (
    select 1 from vault.decrypted_secrets
    where name = 'notificar_cobranca_token' and decrypted_secret = p_token
  );
$$;

revoke all on function public.verificar_token_interno(text) from public, anon, authenticated;
grant execute on function public.verificar_token_interno(text) to service_role;

-- 6. Trigger: dispara só na transição "virou cobrança" ------------------------
-- Transição = nasce fora do rascunho (INSERT) ou sai do rascunho (UPDATE com
-- OLD.status = 'draft'). Estado de cobrança = 'sent' / 'pendente' (legado),
-- ou paga automaticamente porque o aporte cobre 100% (decisão do gestor:
-- avisar também nesse caso). Falha aqui nunca bloqueia a cobrança.
create or replace function public.trg_notificar_cobranca_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_virou_cobranca boolean;
  v_token text;
begin
  if not (TG_OP = 'INSERT' or OLD.status = 'draft') then
    return NEW;
  end if;

  if NEW.owner_id is null then
    return NEW;
  end if;

  v_virou_cobranca :=
       NEW.status in ('sent', 'pendente')
    or (NEW.status like 'pago%'
        and NEW.amount_cents > 0
        and coalesce(NEW.management_contribution_cents, 0) >= NEW.amount_cents);

  if not v_virou_cobranca then
    return NEW;
  end if;

  begin
    select decrypted_secret into v_token
    from vault.decrypted_secrets
    where name = 'notificar_cobranca_token';

    perform net.http_post(
      url     := 'https://ktzfovzwayfqczytmhno.supabase.co/functions/v1/notificar-cobranca',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-internal-token', v_token),
      body    := jsonb_build_object('cobranca_id', NEW.id)
    );
  exception when others then
    raise warning 'notificar-cobranca: falha ao agendar o envio (%). A cobranca segue normal.', sqlerrm;
  end;

  return NEW;
end;
$$;

drop trigger if exists trg_notificar_cobranca_whatsapp on public.charges;
create trigger trg_notificar_cobranca_whatsapp
  after insert or update of status on public.charges
  for each row
  execute function public.trg_notificar_cobranca_whatsapp();
