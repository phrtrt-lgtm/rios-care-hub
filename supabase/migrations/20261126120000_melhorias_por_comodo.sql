-- Plano de melhorias por cômodo (2026-11-26, pedido do gestor: ar e TV numerados por quarto, mobília de varanda,
-- máquina de lavar e lava e seca, secador, sofá-cama, churrasqueira e mais nove itens; e uma maquete por tipo de imóvel).
--
-- O que muda em relação a 20261122120000:
--   1. `properties.melhorias_ficha`: o que a ficha .md diz que o imóvel tem, já lido cômodo a cômodo por
--      scripts/fichas/itens_das_fichas.py: {"modelo": "apto2", "quartos": 2, "capacidade": 7, "tem": {"ar_q1": true, ...}}.
--      Só sim e não: nada do texto da ficha (que tem senha e código) vai para esta coluna. Ler tabela de quartos por
--      expressão regular dentro do banco não dava conta dos formatos das fichas; por isso a leitura saiu do banco.
--      A coluna é recarregada quando as fichas são enviadas ao portal (README em scripts/fichas).
--   2. melhorias_imovel() lê essa coluna (do imóvel e da carteira) e devolve também `modelo`, `quartos` e `capacidade`.
--   3. melhorias_da_ficha(text) deixa de existir.
-- Acesso igual ao de antes.

alter table public.properties add column if not exists melhorias_ficha jsonb;
comment on column public.properties.melhorias_ficha is
  'O que a ficha do imóvel diz que ele tem, por item (sim/não), o modelo de maquete e o número de quartos. Gerado por scripts/fichas/itens_das_fichas.py.';

create or replace function public.melhorias_imovel(p_property_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_equipe boolean;
  v_imovel record;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ini date;
  v_fim date;
  v_tem jsonb;
  v_base jsonb;
  v_carteira jsonb;
  v_contagem jsonb;
  v_imoveis int;
  v_hospedes jsonb;
  v_do_imovel jsonb;
  v_pct numeric;
begin
  if v_uid is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  v_equipe := exists (select 1 from profiles where id = v_uid and role in ('admin', 'agent'));
  select p.id, p.name, p.default_commission_percentage, p.melhorias_ficha into v_imovel from properties p where p.id = p_property_id;
  if not found then
    raise exception 'imovel_nao_encontrado' using errcode = 'P0002';
  end if;
  if not v_equipe and not has_property_access(v_uid, p_property_id) then
    raise exception 'sem_acesso' using errcode = '42501';
  end if;

  -- os 12 meses fechados mais recentes
  v_fim := date_trunc('month', v_hoje)::date;
  v_ini := (v_fim - interval '12 months')::date;

  v_tem := v_imovel.melhorias_ficha->'tem';

  v_pct := coalesce(
    v_imovel.default_commission_percentage,
    (select c.commission_percent from contracts c where c.property_id = p_property_id and c.commission_percent is not null order by c.updated_at desc limit 1)
  );

  -- o imóvel nos 12 meses: só as noites que caem na janela
  select jsonb_build_object(
           'noites', coalesce(sum(x.noites), 0),
           'dias', (v_fim - v_ini),
           'diarias_cents', coalesce(round(sum(x.diarias)), 0),
           'taxa_canal_cents', coalesce(round(sum(x.taxa)), 0),
           'reservas', count(*)
         )
    into v_base
    from (
      select (least(u.check_out, v_fim) - greatest(u.check_in, v_ini)) as noites,
             (u.total_cents - u.limpeza_cents)::numeric * (least(u.check_out, v_fim) - greatest(u.check_in, v_ini)) / (u.check_out - u.check_in) as diarias,
             u.taxa_canal_cents::numeric * (least(u.check_out, v_fim) - greatest(u.check_in, v_ini)) / (u.check_out - u.check_in) as taxa
        from reservas_unificadas() u
        left join hostex_reservations h on u.fonte = 'hostex' and h.reservation_code = u.codigo
       where u.property_id = p_property_id and h.interna is null
         and u.check_out > v_ini and u.check_in < v_fim and u.check_out > u.check_in
    ) x;
  v_base := v_base || jsonb_build_object('comissao_pct', v_pct);

  -- a carteira: cada imóvel com ficha e pelo menos 6 meses com hóspede na janela
  with feat as (
    select p.id as property_id, p.melhorias_ficha->'tem' as f, (p.melhorias_ficha->>'capacidade')::int as capacidade
      from properties p where jsonb_typeof(p.melhorias_ficha->'tem') = 'object'
  ),
  res as (
    select u.property_id, u.check_in, u.check_out, u.total_cents, u.limpeza_cents
      from reservas_unificadas() u
      join properties p on p.id = u.property_id
      left join hostex_reservations h on u.fonte = 'hostex' and h.reservation_code = u.codigo
     where h.interna is null and not p.fora_da_media_rios and p.archived_at is null
       and u.check_out > v_ini and u.check_in < v_fim and u.check_out > u.check_in
  ),
  noites as (
    select r.property_id, n::date as dia, (r.total_cents - r.limpeza_cents)::numeric / (r.check_out - r.check_in) as diaria
      from res r
      cross join lateral generate_series(greatest(r.check_in, v_ini)::timestamp, (least(r.check_out, v_fim) - 1)::timestamp, interval '1 day') n
  ),
  pm as (
    select property_id, date_trunc('month', dia)::date as mes, count(*)::numeric as noites, sum(diaria) as receita
      from noites group by 1, 2
  ),
  mer as (
    select distinct on (mm.property_id, mm.mes) mm.property_id, mm.mes, mm.ocupacao, mm.diaria_cents
      from mercado_mensal mm
      join properties p on p.id = mm.property_id
     where mm.categoria = coalesce(nullif(p.mercado_categoria, ''), '-1') and mm.origem = 'historico'
       and mm.mes >= v_ini and mm.mes < v_fim
     order by mm.property_id, mm.mes, mm.synced_at desc
  ),
  perf as (
    select pm.property_id,
           count(*) as meses,
           sum(pm.noites) as noites,
           sum(pm.receita) as receita,
           sum(extract(day from (pm.mes + interval '1 month - 1 day'))::numeric) as dias,
           sum(pm.receita) filter (where mer.ocupacao > 0 and mer.diaria_cents > 0)
             / nullif(sum(mer.ocupacao * mer.diaria_cents * extract(day from (pm.mes + interval '1 month - 1 day'))::numeric)
                        filter (where mer.ocupacao > 0 and mer.diaria_cents > 0), 0) as idx
      from pm left join mer on mer.property_id = pm.property_id and mer.mes = pm.mes
     group by pm.property_id
  ),
  base as (
    select f.property_id, f.f, p.noites / p.dias as ocup, p.receita / nullif(p.noites, 0) as diaria, p.receita / p.dias as por_dia,
           ntile(3) over (order by p.idx desc nulls last) as terco
      from feat f join perf p using (property_id)
     where p.meses >= 6 and f.f is not null
  ),
  itens as (
    select e.key as item, (e.value)::text::boolean as tem, b.ocup, b.diaria, b.por_dia, b.terco
      from base b cross join lateral jsonb_each(b.f) e
     where jsonb_typeof(e.value) = 'boolean'
  ),
  lados as (
    select item, tem, count(*) as n,
           percentile_cont(0.5) within group (order by ocup) as ocup,
           percentile_cont(0.5) within group (order by diaria) as diaria,
           percentile_cont(0.5) within group (order by por_dia) as por_dia,
           count(*) filter (where terco = 1) as topo
      from itens group by item, tem
  ),
  pares as (
    select c.item,
           jsonb_build_object(
             'com', jsonb_build_object('n', c.n, 'ocupacao', round(c.ocup::numeric, 4), 'diaria_cents', round(c.diaria::numeric), 'por_dia_cents', round(c.por_dia::numeric), 'no_topo', c.topo),
             'sem', jsonb_build_object('n', s.n, 'ocupacao', round(s.ocup::numeric, 4), 'diaria_cents', round(s.diaria::numeric), 'por_dia_cents', round(s.por_dia::numeric), 'no_topo', s.topo)
           ) as par
      from lados c join lados s on s.item = c.item and c.tem and not s.tem
     where c.n >= 5 and s.n >= 5
  )
  select coalesce((select jsonb_object_agg(item, par) from pares), '{}'::jsonb),
         coalesce((select jsonb_object_agg(item, n) from lados where tem), '{}'::jsonb),
         (select count(*) from base)
    into v_carteira, v_contagem, v_imoveis;

  -- quem viaja: reservas da Hostex com a contagem de hóspedes, pela data de entrada
  with feat as (
    select p.id as property_id, p.melhorias_ficha->'tem' as f, (p.melhorias_ficha->>'capacidade')::int as capacidade
      from properties p where jsonb_typeof(p.melhorias_ficha->'tem') = 'object'
  ),
  r as (
    select h.property_id,
           (h.raw->>'number_of_adults')::int as adultos,
           case when h.raw->>'number_of_children' ~ '^\d{1,3}$' then (h.raw->>'number_of_children')::int else 0 end as criancas,
           case when h.raw->>'number_of_infants' ~ '^\d{1,3}$' then (h.raw->>'number_of_infants')::int else 0 end as bebes,
           case when h.raw->>'number_of_pets' ~ '^\d{1,3}$' then (h.raw->>'number_of_pets')::int else 0 end as pets,
           (f.f->>'pet')::boolean as aceita_pet,
           f.capacidade
      from hostex_reservations h
      left join feat f on f.property_id = h.property_id
     where h.status = 'accepted' and h.interna is null and h.property_id is not null
       and h.check_in_date >= v_ini and h.check_in_date < v_fim and h.check_out_date > h.check_in_date
       and h.raw->>'number_of_adults' ~ '^\d{1,3}$'
  ),
  resumo as (
    select grupo,
           jsonb_build_object(
             'reservas', count(*),
             'com_bebe', round(avg((bebes > 0)::int)::numeric, 4),
             'com_crianca_ou_bebe', round(avg((criancas > 0 or bebes > 0)::int)::numeric, 4),
             'com_pet', round(avg((pets > 0)::int)::numeric, 4),
             'com_pet_onde_aceita', round(avg((pets > 0)::int) filter (where aceita_pet)::numeric, 4),
             'grupo_medio', round(avg(adultos + criancas)::numeric, 2),
             'grupo_7_ou_mais', round(avg((adultos + criancas >= 7)::int)::numeric, 4),
             'lotam', round(avg((adultos + criancas >= capacidade)::int) filter (where capacidade is not null)::numeric, 4)
           ) as j
      from (
        select 'carteira' as grupo, r.* from r
        union all
        select 'imovel', r.* from r where r.property_id = p_property_id
      ) t
     group by grupo
  )
  select (select j from resumo where grupo = 'carteira'), (select j from resumo where grupo = 'imovel')
    into v_hospedes, v_do_imovel;

  return jsonb_build_object(
    'imovel', jsonb_build_object('id', v_imovel.id, 'nome', v_imovel.name),
    'periodo', jsonb_build_object('de', to_char(v_ini, 'YYYY-MM'), 'ate', to_char((v_fim - 1), 'YYYY-MM')),
    'modelo', v_imovel.melhorias_ficha->>'modelo',
    'quartos', (v_imovel.melhorias_ficha->>'quartos')::int,
    'capacidade', (v_imovel.melhorias_ficha->>'capacidade')::int,
    'tem', v_tem,
    'base', v_base,
    'carteira', jsonb_build_object('imoveis', v_imoveis, 'itens', v_carteira, 'tem', v_contagem),
    'hospedes', v_hospedes,
    'do_imovel', v_do_imovel
  );
end;
$function$;

revoke all on function public.melhorias_imovel(uuid) from public, anon;
grant execute on function public.melhorias_imovel(uuid) to authenticated;

drop function if exists public.melhorias_da_ficha(text);
