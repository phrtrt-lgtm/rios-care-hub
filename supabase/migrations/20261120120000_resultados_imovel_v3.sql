-- Resultados do imóvel, versão 3 (2026-11-20, pedido do gestor: "Quem se hospedou", "Ritmo de venda").
--
-- O que muda em relação à versão de 2026-10-06 (20261005120100 + ajustes da média RIOS e do mercado):
--   1. cada reserva da Hostex traz quantos adultos, crianças, bebês e pets vieram. É contagem: nome,
--      telefone e e-mail do hóspede continuam fora (o nome só vai para a equipe, como antes);
--   2. `ritmo`: quanto de cada um dos três próximos meses já está reservado na média dos imóveis ativos
--      da RIOS (teve hóspede saindo nos últimos 90 dias ou tem reserva à frente), fora os marcados em
--      properties.fora_da_media_rios. É um número só por mês, sem citar imóvel nenhum;
--   3. cada linha de `mercado` traz `coletado_em`, para a página dizer de quando é a posição do mercado;
--   4. reserva interna ("Proprietário" / "MANUTENÇÃO", hostex_reservations.interna) fica fora da lista do
--      imóvel e da média RIOS. Era o bloco 3 da migration 20261101120000, que mexia em
--      reservas_unificadas() e não chegou a ser aplicado; aqui o filtro fica nesta função, que é quem
--      alimenta a página, e reservas_unificadas() não muda.
--
-- Só acrescenta campos: a página publicada antes desta versão ignora o que não conhece.
-- Acesso igual ao de antes: precisa de sessão; equipe (admin, agent) vê qualquer imóvel, o resto só com
-- has_property_access.

create or replace function public.resultados_imovel(p_property_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
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
  v_mercado jsonb;
  v_ritmo jsonb;
  v_categoria text;
  v_coleta timestamptz;
  v_primeira date;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  v_equipe := exists (select 1 from profiles where id = v_uid and role in ('admin', 'agent'));
  select p.id, p.name, p.address, p.cover_photo_url, p.default_commission_percentage, p.mercado_categoria
    into v_imovel from properties p where p.id = p_property_id;
  if not found then
    raise exception 'imovel_nao_encontrado' using errcode = 'P0002';
  end if;
  if not v_equipe and not has_property_access(v_uid, p_property_id) then
    raise exception 'sem_acesso' using errcode = '42501';
  end if;
  v_inicio := (date_trunc('month', v_hoje) - interval '14 months')::date;
  v_fim := (date_trunc('month', v_hoje) + interval '13 months')::date;
  v_categoria := coalesce(nullif(v_imovel.mercado_categoria, ''), '-1');
  v_pct := coalesce(
    v_imovel.default_commission_percentage,
    (select c.commission_percent from contracts c where c.property_id = p_property_id and c.commission_percent is not null order by c.updated_at desc limit 1)
  );

  select coalesce(jsonb_agg(to_jsonb(x) order by x.check_in, x.id), '[]'::jsonb)
    into v_reservas
    from (
      select
        left(md5(u.codigo), 12) as id,
        u.fonte, u.canal, u.check_in, u.check_out, u.hospedes, u.situacao, u.reservado_em,
        u.total_cents, u.taxa_canal_cents, u.limpeza_cents,
        case
          when u.fone like '55__________%' then 'BR-' || substring(u.fone from 3 for 2)
          when u.fone <> '' and length(u.fone) >= 10 then '+' || left(u.fone, 2)
        end as origem,
        case when v_equipe then u.hospede end as hospede,
        -- quem veio: só a Hostex informa, e só quando informa os adultos (senão os quatro ficam nulos)
        case when h.raw->>'number_of_adults' ~ '^\d{1,3}$' then (h.raw->>'number_of_adults')::int end as adultos,
        case when h.raw->>'number_of_adults' ~ '^\d{1,3}$'
             then case when h.raw->>'number_of_children' ~ '^\d{1,3}$' then (h.raw->>'number_of_children')::int else 0 end end as criancas,
        case when h.raw->>'number_of_adults' ~ '^\d{1,3}$'
             then case when h.raw->>'number_of_infants' ~ '^\d{1,3}$' then (h.raw->>'number_of_infants')::int else 0 end end as bebes,
        case when h.raw->>'number_of_adults' ~ '^\d{1,3}$'
             then case when h.raw->>'number_of_pets' ~ '^\d{1,3}$' then (h.raw->>'number_of_pets')::int else 0 end end as pets
      from reservas_unificadas() u
      left join hostex_reservations h on u.fonte = 'hostex' and h.reservation_code = u.codigo
      where u.property_id = p_property_id and u.check_out > v_inicio and u.check_in < v_fim
        and h.interna is null
    ) x;

  select coalesce(jsonb_agg(jsonb_build_object('d', c.date, 'preco_cents', c.price_cents, 'livre', coalesce(c.inventory, 0) > 0, 'min', c.min_stay) order by c.date), '[]'::jsonb)
    into v_calendario
    from (
      select distinct on (date) date, price_cents, inventory, min_stay
        from hostex_listing_calendar
       where property_id = p_property_id and date >= v_hoje
       order by date, (channel_type = 'airbnb') desc, synced_at desc
    ) c;

  with todas as (
    select u.*
      from reservas_unificadas() u
      join properties p on p.id = u.property_id
     where not p.fora_da_media_rios
       and not exists (
         select 1 from hostex_reservations h
          where u.fonte = 'hostex' and h.reservation_code = u.codigo and h.interna is not null
       )
  ),
  meses as (select gs::date as mes from generate_series(v_inicio::timestamp, (v_fim - 1)::timestamp, interval '1 month') gs),
  noites as (
    select u.property_id, date_trunc('month', n)::date as mes, (u.total_cents - u.limpeza_cents)::numeric / (u.check_out - u.check_in) as diaria_cents
      from todas u
      cross join lateral generate_series(u.check_in::timestamp, (u.check_out - 1)::timestamp, interval '1 day') n
     where u.check_out > v_inicio and u.check_in < v_fim
  ),
  por_mes as (select mes, count(*) as noites, count(distinct property_id) as imoveis, avg(diaria_cents) as diaria_media from noites group by mes)
  select coalesce(jsonb_agg(jsonb_build_object(
           'mes', to_char(m.mes, 'YYYY-MM'),
           'ocupacao', case when coalesce(pm.imoveis, 0) > 0 then round(pm.noites::numeric / (pm.imoveis * extract(day from (m.mes + interval '1 month - 1 day'))::int), 4) end,
           'diaria_cents', round(pm.diaria_media),
           'imoveis', coalesce(pm.imoveis, 0)
         ) order by m.mes), '[]'::jsonb)
    into v_referencia
    from meses m
    left join por_mes pm on pm.mes = m.mes;

  select coalesce(jsonb_agg(jsonb_build_object(
           'mes', to_char(mm.mes, 'YYYY-MM'),
           'ocupacao', mm.ocupacao,
           'ocupacao_ano_anterior', mm.ocupacao_ano_anterior,
           'diaria_cents', mm.diaria_cents,
           'preco_mediano_cents', mm.preco_mediano_cents,
           'listagens', mm.listagens,
           'origem', mm.origem,
           'coletado_em', mm.synced_at
         ) order by mm.mes), '[]'::jsonb)
    into v_mercado
    from (
      select distinct on (mes) *
        from mercado_mensal
       where property_id = p_property_id and categoria = v_categoria and mes >= v_inicio and mes < v_fim
       order by mes, synced_at desc
    ) mm;

  -- Ritmo da carteira: os três meses depois do atual, sobre os imóveis ativos (não só os que já têm
  -- reserva no mês, como na média RIOS: à frente isso deixaria de fora justamente quem está vazio).
  with ativos as (
    select distinct r.property_id
      from hostex_reservations r
      join properties p on p.id = r.property_id
     where r.status = 'accepted' and r.interna is null and not p.fora_da_media_rios
       and r.check_out_date > v_hoje - 90
  ),
  meses as (
    select gs::date as mes
      from generate_series(
             (date_trunc('month', v_hoje) + interval '1 month')::timestamp,
             (date_trunc('month', v_hoje) + interval '3 months')::timestamp,
             interval '1 month') gs
  ),
  noites as (
    select m.mes, sum(least(r.check_out_date, (m.mes + interval '1 month')::date) - greatest(r.check_in_date, m.mes)) as n
      from meses m
      join hostex_reservations r
        on r.status = 'accepted' and r.interna is null
       and r.check_in_date < (m.mes + interval '1 month')::date and r.check_out_date > m.mes
      join ativos a on a.property_id = r.property_id
     group by m.mes
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'mes', to_char(m.mes, 'YYYY-MM'),
           'reservado', case when q.total > 0
                             then round(coalesce(n.n, 0)::numeric / (q.total * extract(day from (m.mes + interval '1 month - 1 day'))::int), 4) end,
           'imoveis', q.total
         ) order by m.mes), '[]'::jsonb)
    into v_ritmo
    from meses m
    cross join (select count(*)::int as total from ativos) q
    left join noites n on n.mes = m.mes;

  select min((x->>'check_in')::date) into v_primeira from jsonb_array_elements(v_reservas) x;
  select max(synced_at) into v_coleta from hostex_reservations;

  return jsonb_build_object(
    'imovel', jsonb_build_object('id', v_imovel.id, 'nome', v_imovel.name, 'endereco', v_imovel.address, 'capa', v_imovel.cover_photo_url),
    'comissao_pct', v_pct,
    'primeira_reserva', v_primeira,
    'reservas', v_reservas,
    'calendario', v_calendario,
    'referencia', v_referencia,
    'mercado', v_mercado,
    'mercado_categoria', v_categoria,
    'ritmo', v_ritmo,
    'coletado_em', v_coleta,
    'visao_equipe', v_equipe
  );
end;
$function$;
