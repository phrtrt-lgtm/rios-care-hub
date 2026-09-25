-- WhatsApp também quando uma cobrança já enviada vira gratuita (aporte da gestão ≥ valor).
--
-- Antes: o trigger só agia na criação ou na saída do rascunho, e só escutava
-- UPDATE OF status. Na lista de manutenções, igualar o aporte ao valor de uma
-- cobrança já enviada faz auto_pay_full_contribution_charges (BEFORE) marcar
-- 'pago_no_vencimento' — mas o UPDATE só mexe em management_contribution_cents,
-- então o trigger nem rodava, e o proprietário não era avisado.
--
-- Agora:
-- * escuta status, management_contribution_cents e amount_cents;
-- * criação/saída do rascunho: igual a antes;
-- * cobrança em aberto que passa a paga com aporte ≥ valor: avisa com
--   reenviar=true (o WhatsApp de "enviada" pode já ter saído — é outra notícia).
-- Rascunho editado, aporte parcial e cobrança já paga continuam sem disparar.

create or replace function public.trg_notificar_cobranca_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_perdoada boolean;
  v_virou_cobranca boolean;
  v_reenviar boolean := false;
  v_token text;
begin
  if NEW.owner_id is null then
    return NEW;
  end if;

  v_perdoada :=
        (NEW.status like 'pago%' or NEW.status = 'paid')
    and NEW.amount_cents > 0
    and coalesce(NEW.management_contribution_cents, 0) >= NEW.amount_cents;

  if TG_OP = 'INSERT' or OLD.status = 'draft' then
    v_virou_cobranca := NEW.status in ('sent', 'pendente') or v_perdoada;
  elsif v_perdoada
    and OLD.status not like 'pago%'
    and OLD.status not in ('paid', 'cancelled', 'arquivado', 'debited', 'draft') then
    v_virou_cobranca := true;
    v_reenviar := true;
  else
    return NEW;
  end if;

  if not v_virou_cobranca then
    return NEW;
  end if;

  begin
    select decrypted_secret into v_token
    from vault.decrypted_secrets
    where name = 'notificar_cobranca_token';

    perform net.http_post(
      url     := 'https://ktzfovzwayfqczytmhno.supabase.co/functions/v1/notificar-cobranca',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-token', v_token),
      body    := jsonb_build_object('cobranca_id', NEW.id, 'reenviar', v_reenviar)
    );
  exception when others then
    raise warning 'notificar-cobranca: falha ao agendar o envio (%). A cobranca segue normal.', sqlerrm;
  end;

  return NEW;
end;
$$;

drop trigger if exists trg_notificar_cobranca_whatsapp on public.charges;
create trigger trg_notificar_cobranca_whatsapp
  after insert or update of status, management_contribution_cents, amount_cents
  on public.charges
  for each row
  execute function public.trg_notificar_cobranca_whatsapp();
