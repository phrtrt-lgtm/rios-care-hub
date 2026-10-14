alter table public.properties add column if not exists notificar_reservas_whatsapp boolean not null default false;

alter table public.hostex_reservations
  add column if not exists whatsapp_reserva_status text,
  add column if not exists whatsapp_reserva_enviado_em timestamptz,
  add column if not exists whatsapp_reserva_message_id text,
  add column if not exists whatsapp_reserva_erro text;
alter table public.hostex_reservations drop constraint if exists hostex_reservations_whatsapp_reserva_status_check;
alter table public.hostex_reservations add constraint hostex_reservations_whatsapp_reserva_status_check
  check (whatsapp_reserva_status is null or whatsapp_reserva_status in ('enviado','falhou','desativado','sem_telefone'));

create table if not exists public.hostex_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text unique,
  event text,
  payload jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);
grant select on public.hostex_webhook_events to authenticated;
grant all on public.hostex_webhook_events to service_role;
alter table public.hostex_webhook_events enable row level security;
create policy "Admins leem eventos hostex" on public.hostex_webhook_events
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

create or replace function public.guard_notificar_reservas_whatsapp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and new.notificar_reservas_whatsapp is distinct from old.notificar_reservas_whatsapp
     and not public.is_team_member(auth.uid()) then
    raise exception 'Somente a equipe altera o aviso de reservas.' using errcode = '42501';
  end if;
  return new;
end; $$;
drop trigger if exists trg_guard_notificar_reservas on public.properties;
create trigger trg_guard_notificar_reservas before update on public.properties
  for each row execute function public.guard_notificar_reservas_whatsapp();

-- Chamada sem token: a function confere de novo todas as condições abaixo e
-- só envia uma vez por reserva; reenvio exige admin.
create or replace function public.trg_notificar_reserva_whatsapp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.status is distinct from 'accepted' then return NEW; end if;
  if TG_OP = 'UPDATE' and OLD.status is not distinct from 'accepted' then return NEW; end if;
  if NEW.booked_at is null or NEW.booked_at < now() - interval '48 hours' then return NEW; end if;
  if NEW.check_out_date is null or NEW.check_out_date < current_date then return NEW; end if;
  if NEW.property_id is null then return NEW; end if;
  begin
    perform net.http_post(
      url := 'https://ktzfovzwayfqczytmhno.supabase.co/functions/v1/notificar-reserva',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := jsonb_build_object('reservation_code', NEW.reservation_code));
  exception when others then
    raise warning 'notificar-reserva: falha ao agendar (%)', sqlerrm;
  end;
  return NEW;
end; $$;
drop trigger if exists trg_notificar_reserva_whatsapp on public.hostex_reservations;
create trigger trg_notificar_reserva_whatsapp after insert or update of status on public.hostex_reservations
  for each row execute function public.trg_notificar_reserva_whatsapp();