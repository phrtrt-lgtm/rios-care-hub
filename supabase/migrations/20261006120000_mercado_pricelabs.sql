-- Média do mercado (PriceLabs) e regras novas da média RIOS na página de resultados.
--
-- 1) mercado_mensal: resumo mensal do mercado em volta de cada listagem, por
--    categoria ("-1" = listagens vizinhas; "0", "1", "2"… = quartos), gravado
--    pela function pricelabs-sync (uma chamada por listagem por dia).
-- 2) properties.fora_da_media_rios (criada em 2026-10-06): imóvel que não entra
--    na média da carteira (JOÃO, REGINA).
-- 3) properties.mercado_categoria: qual categoria do PriceLabs usar como
--    "mercado" daquele imóvel; vazio = "-1" (vizinhas).
-- 4) resultados_imovel v3: média RIOS só com imóveis que tiveram pelo menos
--    uma noite reservada no mês ("funcionais"), sem os marcados como fora; e
--    a série do mercado por mês.
-- 5) cron pricelabs-sync-hourly.

create table if not exists public.mercado_mensal (
  listing_id text not null,
  pms text not null default 'hostex',
  property_id uuid references public.properties(id) on delete set null,
  categoria text not null,
  mes date not null,
  ocupacao numeric(5,4),
  ocupacao_ano_anterior numeric(5,4),
  diaria_cents integer,
  preco_mediano_cents integer,
  listagens integer,
  origem text not null,
  synced_at timestamptz not null default now(),
  primary key (listing_id, categoria, mes)
);
create index if not exists idx_mercado_mensal_imovel on public.mercado_mensal (property_id, categoria, mes);
comment on table public.mercado_mensal is 'Mercado em volta de cada listagem (PriceLabs neighborhood_data), por mês e categoria. Alimentada pela function pricelabs-sync.';

alter table public.mercado_mensal enable row level security;
drop policy if exists "Equipe le mercado_mensal" on public.mercado_mensal;
create policy "Equipe le mercado_mensal" on public.mercado_mensal
  for select to authenticated using (is_team_member(auth.uid()));
-- O proprietário recebe só pela função resultados_imovel (security definer).

create table if not exists public.pricelabs_sync_log (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  triggered_by text,
  listings_total integer,
  listings_synced integer,
  rows_upserted integer,
  error_message text
);
alter table public.pricelabs_sync_log enable row level security;
drop policy if exists "Equipe le pricelabs_sync_log" on public.pricelabs_sync_log;
create policy "Equipe le pricelabs_sync_log" on public.pricelabs_sync_log
  for select to authenticated using (is_team_member(auth.uid()));

alter table public.properties add column if not exists fora_da_media_rios boolean not null default false;
comment on column public.properties.fora_da_media_rios is 'Fora da média da carteira RIOS na página de resultados (imóvel atípico). Pedido do gestor em 2026-10-06: JOÃO e REGINA.';
alter table public.properties add column if not exists mercado_categoria text;
comment on column public.properties.mercado_categoria is 'Categoria do PriceLabs usada como mercado do imóvel em mercado_mensal ("-1" vizinhas, "0" estúdio, "1", "2"… quartos). Vazio = "-1".';

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
  v_mercado jsonb;
  v_categoria text;
  v_coleta timestamptz;
  v_primeira date;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;

  v_equipe := exists (select 1 from profiles where id = v_uid and role in ('admin', 'agent'));

  select p.id, p.name, p.address, p.cover_photo_url, p.default_commission_percentage, p.mercado_categoria
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
  v_categoria := coalesce(nullif(v_imovel.mercado_categoria, ''), '-1');

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
        left(md5(u.codigo), 12) as id,
        u.fonte, u.canal, u.check_in, u.check_out, u.hospedes, u.situacao, u.reservado_em,
        u.total_cents, u.taxa_canal_cents, u.limpeza_cents,
        case
          when u.fone like '55__________%' then 'BR-' || substring(u.fone from 3 for 2)
          when u.fone <> '' and length(u.fone) >= 10 then '+' || left(u.fone, 2)
        end as origem,
        case when v_equipe then u.hospede end as hospede
      from reservas_unificadas() u
      where u.property_id = p_property_id and u.check_out > v_inicio and u.check_in < v_fim
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

  -- Média da carteira RIOS por mês: só imóveis que tiveram ao menos uma noite
  -- reservada no mês (imóvel novo ou parado não derruba a média) e fora os
  -- marcados em properties.fora_da_media_rios.
  with todas as (
    select u.*
      from reservas_unificadas() u
      join properties p on p.id = u.property_id
     where not p.fora_da_media_rios
  ),
  meses as (
    select gs::date as mes
      from generate_series(v_inicio::timestamp, (v_fim - 1)::timestamp, interval '1 month') gs
  ),
  noites as (
    select u.property_id,
           date_trunc('month', n)::date as mes,
           (u.total_cents - u.limpeza_cents)::numeric / (u.check_out - u.check_in) as diaria_cents
      from todas u
      cross join lateral generate_series(u.check_in::timestamp, (u.check_out - 1)::timestamp, interval '1 day') n
     where u.check_out > v_inicio and u.check_in < v_fim
  ),
  por_mes as (
    select mes, count(*) as noites, count(distinct property_id) as imoveis, avg(diaria_cents) as diaria_media
      from noites
     group by mes
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'mes', to_char(m.mes, 'YYYY-MM'),
           'ocupacao', case when coalesce(pm.imoveis, 0) > 0
                            then round(pm.noites::numeric / (pm.imoveis * extract(day from (m.mes + interval '1 month - 1 day'))::int), 4)
                       end,
           'diaria_cents', round(pm.diaria_media),
           'imoveis', coalesce(pm.imoveis, 0)
         ) order by m.mes), '[]'::jsonb)
    into v_referencia
    from meses m
    left join por_mes pm on pm.mes = m.mes;

  -- Mercado (PriceLabs): a categoria escolhida para o imóvel, ou "-1" (vizinhas).
  select coalesce(jsonb_agg(jsonb_build_object(
           'mes', to_char(mm.mes, 'YYYY-MM'),
           'ocupacao', mm.ocupacao,
           'ocupacao_ano_anterior', mm.ocupacao_ano_anterior,
           'diaria_cents', mm.diaria_cents,
           'preco_mediano_cents', mm.preco_mediano_cents,
           'listagens', mm.listagens,
           'origem', mm.origem
         ) order by mm.mes), '[]'::jsonb)
    into v_mercado
    from (
      select distinct on (mes) *
        from mercado_mensal
       where property_id = p_property_id
         and categoria = v_categoria
         and mes >= v_inicio and mes < v_fim
       order by mes, synced_at desc
    ) mm;

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
    'coletado_em', v_coleta,
    'visao_equipe', v_equipe
  );
end;
$$;

revoke all on function public.resultados_imovel(uuid) from public, anon;
grant execute on function public.resultados_imovel(uuid) to authenticated;

-- Cron: de hora em hora; cada rodada atualiza as listagens com mais de 20 h
-- desde a última coleta (até 15 por vez). Mesmo token dos outros crons. A
-- chave pública vai no header porque a function fica com verify_jwt (o
-- config.toml é gerado pelo Lovable e não é editado aqui); quem autoriza de
-- verdade é o token conferido dentro da function.
do $$
declare
  v_key text;
  v_cmd text;
begin
  select (regexp_match(command, '"apikey": "([^"]+)"'))[1] into v_key from cron.job where jobname = 'hostex-sync-6h';
  if v_key is null then
    raise exception 'chave publica nao encontrada no job hostex-sync-6h';
  end if;
  if exists (select 1 from cron.job where jobname = 'pricelabs-sync-hourly') then
    perform cron.unschedule('pricelabs-sync-hourly');
  end if;
  v_cmd := format(
    $c$select net.http_post(url := 'https://ktzfovzwayfqczytmhno.supabase.co/functions/v1/pricelabs-sync?token=' || (select trim(both '"' from value::text) from public.system_config where key = 'charge_cron_token'), headers := %L::jsonb, body := '{}'::jsonb, timeout_milliseconds := 120000);$c$,
    json_build_object('Content-Type', 'application/json', 'apikey', v_key, 'Authorization', 'Bearer ' || v_key)::text
  );
  perform cron.schedule('pricelabs-sync-hourly', '25 * * * *', v_cmd);
end $$;
