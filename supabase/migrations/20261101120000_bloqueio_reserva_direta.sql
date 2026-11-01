-- Bloqueio de datas como RESERVA DIRETA na Hostex (pedido do gestor em 2026-11-01,
-- CLAUDE.md §3.21): o proprietário que paga a taxa por PIX vira uma reserva em
-- nome de "Proprietário"; a manutenção registrada pela equipe (assistente de IA)
-- vira "MANUTENÇÃO · <tipo>". A equipe de limpeza lê as reservas da Hostex no
-- app de limpeza; bloqueio por disponibilidade não aparece lá.
--
-- Essas reservas chegam ao cache (hostex-sync / hostex-webhook) como qualquer
-- outra, com channel_type = 'hostex_direct'. Esta migration:
--   1. marca-as em hostex_reservations.interna ('proprietario' | 'manutencao');
--   2. tira-as de reservas_unificadas() (resultados, média RIOS) — não são
--      receita nem ocupação de hóspede;
--   3. não dispara o WhatsApp de "reserva confirmada" ao proprietário para elas;
--   4. expõe `interna` na view do proprietário;
--   5. guarda em date_block_requests o código e o nome da reserva criada.
-- janela_imoveis() continua contando-as como ocupação (o imóvel está mesmo
-- indisponível, e a limpeza precisa ver).

-- 1. hostex_reservations.interna ------------------------------------------
alter table public.hostex_reservations
  add column if not exists interna text generated always as (
    case
      when channel_type = 'hostex_direct'
       and (coalesce(guest_name, '') ~* '^\s*(propriet|owner|dono)'
            or coalesce(raw->'custom_channel'->>'name', '') ~* 'propriet') then 'proprietario'
      when channel_type = 'hostex_direct'
       and (coalesce(guest_name, '') ~* '^\s*manuten'
            or coalesce(raw->'custom_channel'->>'name', '') ~* 'manuten') then 'manutencao'
    end
  ) stored;

comment on column public.hostex_reservations.interna is
  'Bloqueio interno do portal feito como reserva direta: proprietario (uso pessoal pago por PIX, hóspede "Proprietário") ou manutencao (equipe, hóspede "MANUTENÇÃO · tipo"). Nulo = reserva de hóspede. Fora dos resultados e do WhatsApp de reserva.';

create index if not exists idx_hostex_reservations_interna
  on public.hostex_reservations (property_id, check_in_date)
  where interna is not null;

-- 2. view do proprietário ganha `interna` ------------------------------------
create or replace view public.hostex_reservations_proprietario
with (security_barrier = true) as
select
  r.reservation_code,
  r.property_id,
  r.channel_type,
  r.check_in_date,
  r.check_out_date,
  r.nights,
  r.guests,
  r.status,
  r.stay_status,
  r.total_rate_cents,
  r.currency,
  r.booked_at,
  r.synced_at,
  r.interna
from public.hostex_reservations r
where r.property_id is not null
  and public.has_property_access(auth.uid(), r.property_id);

-- 3. reservas_unificadas(): reserva interna não é receita nem ocupação ------
create or replace function public.reservas_unificadas()
 returns table(property_id uuid, fonte text, codigo text, canal text, check_in date, check_out date, hospedes integer, situacao text, reservado_em timestamp with time zone, total_cents integer, taxa_canal_cents integer, limpeza_cents integer, fone text, hospede text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with hostex as (
    select
      r.property_id, 'hostex'::text as fonte, r.reservation_code as codigo, lower(coalesce(r.channel_type, '')) as canal,
      r.check_in_date as check_in, r.check_out_date as check_out, r.guests as hospedes, r.stay_status as situacao, r.booked_at as reservado_em,
      coalesce(r.total_rate_cents, 0) as total_cents, coalesce(r.total_commission_cents, 0) as taxa_canal_cents,
      coalesce((
        select round(sum((d->>'amount')::numeric) * 100)
          from jsonb_array_elements(case when jsonb_typeof(r.raw->'rates'->'details') = 'array' then r.raw->'rates'->'details' else '[]'::jsonb end) d
         where d->>'type' = 'CLEANING_FEE'
      ), 0)::integer as limpeza_cents,
      regexp_replace(coalesce(r.raw->>'guest_phone', ''), '[^0-9]', '', 'g') as fone,
      r.guest_name as hospede
    from hostex_reservations r
    where r.status = 'accepted' and r.property_id is not null and r.check_out_date > r.check_in_date
      and r.interna is null
  ),
  relatorios as (
    select distinct on (f.property_id, left(e->>'checkin_date', 10), left(e->>'checkout_date', 10))
      f.property_id, 'relatorio'::text as fonte, f.id::text || ':' || coalesce(e->>'id', '') as codigo,
      case when e->>'channel' ~ '^HM[A-Z0-9]{8}$' then 'airbnb' when e->>'channel' ~ '^[0-9]{10}$' then 'booking.com' end as canal,
      left(e->>'checkin_date', 10)::date as check_in, left(e->>'checkout_date', 10)::date as check_out,
      null::integer as hospedes, 'stay_completed'::text as situacao, null::timestamptz as reservado_em,
      round((coalesce((e->>'reservation_value')::numeric, 0) + coalesce((e->>'cleaning_fee')::numeric, 0)) * 100)::integer as total_cents,
      round(coalesce((e->>'channel_commission')::numeric, 0) * 100)::integer as taxa_canal_cents,
      round(coalesce((e->>'cleaning_fee')::numeric, 0) * 100)::integer as limpeza_cents,
      ''::text as fone, e->>'guest_name' as hospede
    from financial_reports f
    cross join lateral jsonb_array_elements(case when jsonb_typeof(f.report_data->'reservations') = 'array' then f.report_data->'reservations' else '[]'::jsonb end) e
    where f.status = 'published' and f.archived_at is null and f.property_id is not null
      and (e->>'checkin_date') ~ '^\d{4}-\d{2}-\d{2}' and (e->>'checkout_date') ~ '^\d{4}-\d{2}-\d{2}'
      and coalesce(e->>'status', '') not ilike '%cancel%'
    order by f.property_id, left(e->>'checkin_date', 10), left(e->>'checkout_date', 10), f.created_at desc
  )
  select * from hostex
  union all
  select r.* from relatorios r
   where r.check_out > r.check_in
     and not exists (select 1 from hostex h where h.property_id = r.property_id and h.check_in < r.check_out and h.check_out > r.check_in)
$function$;

-- 4. WhatsApp de reserva confirmada: não avisa o dono do próprio bloqueio ---
create or replace function public.trg_notificar_reserva_whatsapp()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if NEW.status is distinct from 'accepted' then return NEW; end if;
  if TG_OP = 'UPDATE' and OLD.status is not distinct from 'accepted' then return NEW; end if;
  if NEW.interna is not null then return NEW; end if; -- bloqueio interno (Proprietário / MANUTENÇÃO)
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
end; $function$;

-- 5. date_block_requests: a reserva criada -----------------------------------
alter table public.date_block_requests
  add column if not exists hostex_reservation_code text,
  add column if not exists hostex_guest_name text,
  add column if not exists criado_por uuid;

comment on column public.date_block_requests.hostex_reservation_code is
  'reservation_code da reserva direta criada na Hostex para este bloqueio ("Proprietário" pelo webhook do PIX, "MANUTENÇÃO · tipo" pela IA da equipe). Nulo = bloqueio antigo por disponibilidade. liberar-bloqueio cancela a reserva por este código.';
comment on column public.date_block_requests.hostex_guest_name is
  'Nome gravado como hóspede na Hostex ("Proprietário" ou "MANUTENÇÃO · Pintura"); é o que a equipe de limpeza vê.';
comment on column public.date_block_requests.criado_por is
  'Quem registrou (equipe, pelo assistente de IA). Nulo nos pedidos do próprio proprietário.';

create index if not exists idx_date_block_requests_reserva
  on public.date_block_requests (property_id, start_date)
  where hostex_reservation_code is not null;
