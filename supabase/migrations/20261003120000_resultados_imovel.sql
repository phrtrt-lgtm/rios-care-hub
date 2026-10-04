-- Resultados do imóvel (dashboard do proprietário).
--
-- Uma chamada devolve tudo o que a página /resultados precisa para um imóvel:
-- reservas (sem dado pessoal do hóspede), preços anunciados das próximas noites
-- e a média da carteira RIOS mês a mês. Lê só o cache local da Hostex
-- (hostex_reservations / hostex_listing_calendar), que o cron hostex-sync
-- alimenta: abrir a página nunca chama a Hostex.
--
-- SECURITY DEFINER porque o proprietário não lê hostex_listing_calendar nem as
-- reservas dos outros imóveis (necessárias para a média da carteira). O acesso
-- é conferido aqui: admin/agent veem qualquer imóvel; os demais, só os seus
-- (titular ou co-proprietário, via has_property_access).

create or replace function public.resultados_imovel(p_property_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_equipe boolean;
  v_imovel record;
  v_pct numeric;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_inicio date;
  v_fim date;
  v_reservas jsonb;
  v_calendario jsonb;
  v_referencia jsonb;
  v_coleta timestamptz;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;

  v_equipe := exists (
    select 1 from profiles where id = v_uid and role in ('admin', 'agent')
  );

  select p.id, p.name, p.address, p.cover_photo_url, p.default_commission_percentage
    into v_imovel
    from properties p
   where p.id = p_property_id;
  if not found then
    raise exception 'imovel_nao_encontrado' using errcode = 'P0002';
  end if;

  if not v_equipe and not has_property_access(v_uid, p_property_id) then
    raise exception 'sem_acesso' using errcode = '42501';
  end if;

  -- Janela: 14 meses para trás (12 de gráfico + comparação) até 12 à frente.
  v_inicio := (date_trunc('month', v_hoje) - interval '14 months')::date;
  v_fim := (date_trunc('month', v_hoje) + interval '13 months')::date;

  -- Mesma regra da Central Hostex: % do imóvel; sem ele, o do contrato mais recente.
  v_pct := coalesce(
    v_imovel.default_commission_percentage,
    (select c.commission_percent
       from contracts c
      where c.property_id = p_property_id and c.commission_percent is not null
      order by c.updated_at desc
      limit 1)
  );

  select coalesce(jsonb_agg(to_jsonb(x) order by x.check_in, x.id), '[]'::jsonb)
    into v_reservas
    from (
      select
        left(md5(r.reservation_code), 12) as id,
        lower(coalesce(r.channel_type, 'outro')) as canal,
        r.check_in_date as check_in,
        r.check_out_date as check_out,
        r.guests as hospedes,
        r.stay_status as situacao,
        r.booked_at as reservado_em,
        coalesce(r.total_rate_cents, 0) as total_cents,
        coalesce(r.total_commission_cents, 0) as taxa_canal_cents,
        t.limpeza_cents,
        -- Só a região de origem (país ou DDD), nunca o telefone.
        case
          when f.fone like '55__________%' then 'BR-' || substring(f.fone from 3 for 2)
          when f.fone <> '' and (r.raw->>'guest_phone') like '+%' then '+' || left(f.fone, 2)
        end as origem,
        -- Nome do hóspede só para a equipe.
        case when v_equipe then r.guest_name end as hospede
      from hostex_reservations r
      cross join lateral (
        select coalesce(round(sum((d->>'amount')::numeric) * 100), 0)::int as limpeza_cents
          from jsonb_array_elements(
                 case when jsonb_typeof(r.raw->'rates'->'details') = 'array'
                      then r.raw->'rates'->'details' else '[]'::jsonb end
               ) d
         where d->>'type' = 'CLEANING_FEE'
      ) t
      cross join lateral (
        select regexp_replace(coalesce(r.raw->>'guest_phone', ''), '[^0-9]', '', 'g') as fone
      ) f
      where r.property_id = p_property_id
        and r.status = 'accepted'
        and r.check_out_date > v_inicio
        and r.check_in_date < v_fim
        and r.check_out_date > r.check_in_date
    ) x;

  -- Preço anunciado por noite, de hoje em diante (um canal por data; Airbnb primeiro).
  select coalesce(jsonb_agg(jsonb_build_object(
           'd', c.date, 'preco_cents', c.price_cents, 'livre', coalesce(c.inventory, 0) > 0, 'min', c.min_stay
         ) order by c.date), '[]'::jsonb)
    into v_calendario
    from (
      select distinct on (date) date, price_cents, inventory, min_stay
        from hostex_listing_calendar
       where property_id = p_property_id and date >= v_hoje
       order by date, (channel_type = 'airbnb') desc, synced_at desc
    ) c;

  -- Média da carteira RIOS por mês: ocupação e diária média de todos os imóveis
  -- que já tinham reserva até aquele mês.
  with meses as (
    select gs::date as mes
      from generate_series(v_inicio::timestamp, (v_fim - 1)::timestamp, interval '1 month') gs
  ),
  noites as (
    select date_trunc('month', n)::date as mes,
           (coalesce(r.total_rate_cents, 0) - t.limpeza_cents)::numeric
             / (r.check_out_date - r.check_in_date) as diaria_cents
      from hostex_reservations r
      cross join lateral (
        select coalesce(round(sum((d->>'amount')::numeric) * 100), 0)::int as limpeza_cents
          from jsonb_array_elements(
                 case when jsonb_typeof(r.raw->'rates'->'details') = 'array'
                      then r.raw->'rates'->'details' else '[]'::jsonb end
               ) d
         where d->>'type' = 'CLEANING_FEE'
      ) t
      cross join lateral generate_series(
        r.check_in_date::timestamp, (r.check_out_date - 1)::timestamp, interval '1 day'
      ) n
     where r.status = 'accepted'
       and r.property_id is not null
       and r.check_out_date > r.check_in_date
       and r.check_out_date > v_inicio
       and r.check_in_date < v_fim
  ),
  ativos as (
    select property_id, min(check_in_date) as primeira
      from hostex_reservations
     where status = 'accepted' and property_id is not null
     group by property_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'mes', to_char(m.mes, 'YYYY-MM'),
           'ocupacao', case when a.imoveis > 0
                            then round(coalesce(n.noites, 0)::numeric
                                 / (a.imoveis * extract(day from (m.mes + interval '1 month - 1 day'))::int), 4)
                       end,
           'diaria_cents', round(n.diaria_media),
           'imoveis', a.imoveis
         ) order by m.mes), '[]'::jsonb)
    into v_referencia
    from meses m
    left join lateral (
      select count(*) as noites, avg(diaria_cents) as diaria_media
        from noites where noites.mes = m.mes
    ) n on true
    left join lateral (
      select count(*) as imoveis
        from ativos where primeira < (m.mes + interval '1 month')
    ) a on true;

  select max(synced_at) into v_coleta from hostex_reservations;

  return jsonb_build_object(
    'imovel', jsonb_build_object(
      'id', v_imovel.id,
      'nome', v_imovel.name,
      'endereco', v_imovel.address,
      'capa', v_imovel.cover_photo_url
    ),
    'comissao_pct', v_pct,
    'primeira_reserva', (
      select min(check_in_date) from hostex_reservations
       where property_id = p_property_id and status = 'accepted'
    ),
    'reservas', v_reservas,
    'calendario', v_calendario,
    'referencia', v_referencia,
    'coletado_em', v_coleta,
    'visao_equipe', v_equipe
  );
end;
$$;

revoke all on function public.resultados_imovel(uuid) from public, anon;
grant execute on function public.resultados_imovel(uuid) to authenticated;

comment on function public.resultados_imovel(uuid) is
  'Dashboard de resultados de um imóvel (reservas sem dado pessoal, preços anunciados e média da carteira). Confere o acesso por auth.uid().';
