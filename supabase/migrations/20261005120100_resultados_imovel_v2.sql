-- resultados_imovel v2: lê reservas_unificadas() (Hostex + relatórios
-- financeiros), devolve a fonte de cada reserva e a primeira reserva passa a
-- considerar as duas fontes — assim janeiro e fevereiro de 2026 entram na
-- análise, com ocupação contada desde o primeiro mês com dado.

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
  v_primeira date;
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

  v_inicio := (date_trunc('month', v_hoje) - interval '14 months')::date;
  v_fim := (date_trunc('month', v_hoje) + interval '13 months')::date;

  v_pct := coalesce(
    v_imovel.default_commission_percentage,
    (select c.commission_percent
       from contracts c
      where c.property_id = p_property_id and c.commission_percent is not null
      order by c.updated_at desc
      limit 1)
  );

  -- Função STABLE não pode criar tabela temporária: reservas_unificadas() é
  -- chamada duas vezes (imóvel e carteira). São alguns milissegundos cada.
  select coalesce(jsonb_agg(to_jsonb(x) order by x.check_in, x.id), '[]'::jsonb)
    into v_reservas
    from (
      select
        left(md5(u.codigo), 12) as id,
        u.fonte,
        u.canal,
        u.check_in,
        u.check_out,
        u.hospedes,
        u.situacao,
        u.reservado_em,
        u.total_cents,
        u.taxa_canal_cents,
        u.limpeza_cents,
        case
          when u.fone like '55__________%' then 'BR-' || substring(u.fone from 3 for 2)
          when u.fone <> '' and length(u.fone) >= 10 then '+' || left(u.fone, 2)
        end as origem,
        case when v_equipe then u.hospede end as hospede
      from reservas_unificadas() u
      where u.property_id = p_property_id
        and u.check_out > v_inicio
        and u.check_in < v_fim
    ) x;

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

  with todas as (
    select * from reservas_unificadas()
  ),
  meses as (
    select gs::date as mes
      from generate_series(v_inicio::timestamp, (v_fim - 1)::timestamp, interval '1 month') gs
  ),
  noites as (
    select date_trunc('month', n)::date as mes,
           (u.total_cents - u.limpeza_cents)::numeric / (u.check_out - u.check_in) as diaria_cents
      from todas u
      cross join lateral generate_series(
        u.check_in::timestamp, (u.check_out - 1)::timestamp, interval '1 day'
      ) n
     where u.check_out > v_inicio
       and u.check_in < v_fim
  ),
  ativos as (
    select property_id, min(check_in) as primeira from todas group by property_id
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

  -- Primeira reserva conhecida dentro da janela (Hostex ou relatório).
  select min((x->>'check_in')::date) into v_primeira from jsonb_array_elements(v_reservas) x;
  select max(synced_at) into v_coleta from hostex_reservations;

  return jsonb_build_object(
    'imovel', jsonb_build_object(
      'id', v_imovel.id,
      'nome', v_imovel.name,
      'endereco', v_imovel.address,
      'capa', v_imovel.cover_photo_url
    ),
    'comissao_pct', v_pct,
    'primeira_reserva', v_primeira,
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
