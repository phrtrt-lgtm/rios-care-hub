-- Reservas de todas as fontes para a página de resultados.
--
-- A Hostex só tem reservas de fevereiro/março de 2026 em diante (foi quando a
-- integração começou) e ficou sem coletar de julho a outubro de 2026. Os
-- relatórios financeiros (financial_reports.report_data.reservations) cobrem
-- janeiro em diante, mês a mês. Esta função junta as duas fontes:
--   - Hostex manda: toda reserva aceita entra como está;
--   - do relatório entra só o que a Hostex não tem — reserva do mesmo imóvel
--     cujas noites não cruzam nenhuma reserva da Hostex;
--   - a mesma reserva em dois relatórios conta uma vez (o relatório mais novo).
-- Valores do relatório: reservation_value é a diária sem limpeza, então
-- total = reservation_value + cleaning_fee, igual ao total_rate da Hostex.
-- Só resultados_imovel() chama esta função; ela não é liberada para o cliente.

create or replace function public.reservas_unificadas()
returns table (
  property_id uuid,
  fonte text,
  codigo text,
  canal text,
  check_in date,
  check_out date,
  hospedes integer,
  situacao text,
  reservado_em timestamptz,
  total_cents integer,
  taxa_canal_cents integer,
  limpeza_cents integer,
  fone text,
  hospede text
)
language sql
stable
security definer
set search_path = public
as $$
  with hostex as (
    select
      r.property_id,
      'hostex'::text as fonte,
      r.reservation_code as codigo,
      lower(coalesce(r.channel_type, '')) as canal,
      r.check_in_date as check_in,
      r.check_out_date as check_out,
      r.guests as hospedes,
      r.stay_status as situacao,
      r.booked_at as reservado_em,
      coalesce(r.total_rate_cents, 0) as total_cents,
      coalesce(r.total_commission_cents, 0) as taxa_canal_cents,
      coalesce((
        select round(sum((d->>'amount')::numeric) * 100)
          from jsonb_array_elements(
                 case when jsonb_typeof(r.raw->'rates'->'details') = 'array'
                      then r.raw->'rates'->'details' else '[]'::jsonb end
               ) d
         where d->>'type' = 'CLEANING_FEE'
      ), 0)::integer as limpeza_cents,
      regexp_replace(coalesce(r.raw->>'guest_phone', ''), '[^0-9]', '', 'g') as fone,
      r.guest_name as hospede
    from hostex_reservations r
    where r.status = 'accepted'
      and r.property_id is not null
      and r.check_out_date > r.check_in_date
  ),
  relatorios as (
    select distinct on (f.property_id, left(e->>'checkin_date', 10), left(e->>'checkout_date', 10))
      f.property_id,
      'relatorio'::text as fonte,
      f.id::text || ':' || coalesce(e->>'id', '') as codigo,
      case
        when e->>'channel' ~ '^HM[A-Z0-9]{8}$' then 'airbnb'
        when e->>'channel' ~ '^[0-9]{10}$' then 'booking.com'
      end as canal,
      left(e->>'checkin_date', 10)::date as check_in,
      left(e->>'checkout_date', 10)::date as check_out,
      null::integer as hospedes,
      'stay_completed'::text as situacao,
      null::timestamptz as reservado_em,
      round((coalesce((e->>'reservation_value')::numeric, 0) + coalesce((e->>'cleaning_fee')::numeric, 0)) * 100)::integer as total_cents,
      round(coalesce((e->>'channel_commission')::numeric, 0) * 100)::integer as taxa_canal_cents,
      round(coalesce((e->>'cleaning_fee')::numeric, 0) * 100)::integer as limpeza_cents,
      ''::text as fone,
      e->>'guest_name' as hospede
    from financial_reports f
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(f.report_data->'reservations') = 'array'
           then f.report_data->'reservations' else '[]'::jsonb end
    ) e
    where f.status = 'published'
      and f.archived_at is null
      and f.property_id is not null
      and (e->>'checkin_date') ~ '^\d{4}-\d{2}-\d{2}'
      and (e->>'checkout_date') ~ '^\d{4}-\d{2}-\d{2}'
      and coalesce(e->>'status', '') not ilike '%cancel%'
    order by f.property_id, left(e->>'checkin_date', 10), left(e->>'checkout_date', 10), f.created_at desc
  )
  select * from hostex
  union all
  select r.*
    from relatorios r
   where r.check_out > r.check_in
     and not exists (
       select 1 from hostex h
        where h.property_id = r.property_id
          and h.check_in < r.check_out
          and h.check_out > r.check_in
     )
$$;

revoke all on function public.reservas_unificadas() from public, anon, authenticated;

comment on function public.reservas_unificadas() is
  'Reservas da Hostex + as dos relatórios financeiros que a Hostex não tem. Uso interno de resultados_imovel().';
