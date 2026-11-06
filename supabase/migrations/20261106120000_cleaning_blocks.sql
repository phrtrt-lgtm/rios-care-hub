-- Bloqueio de limpeza por webhook da Hostex (CLAUDE.md §3.22).
--
-- O imóvel leva um dia inteiro para limpar: para cada reserva accepted dos 18
-- imóveis do escopo, o hostex-webhook fecha na Hostex a véspera do check-in e o
-- dia do check-out, e reabre quando a reserva é cancelada ou muda de data.
-- Substitui a skill agendada de "bloqueio de limpeza".
--
--   cleaning_blocks       registro: toda data que ESTE sistema fechou. Só data
--                         com linha ativa aqui pode ser reaberta; bloqueio
--                         manual ou de proprietário nunca entra e nunca é tocado.
--   cleaning_block_log    um registro por evento e imóvel: o que fechou, o que
--                         reabriu, o que descartou e por quê, e a verificação.
--   cleaning_block_locks  trava: um evento por imóvel de cada vez.
--   system_config         chave limpeza_bloqueios: a flag, que nasce desligada.
--
-- Só a service role (a edge function) grava; a equipe lê.

-- 1. Registro -----------------------------------------------------------------
create table if not exists public.cleaning_blocks (
  id uuid primary key default gen_random_uuid(),
  property_id bigint not null,                -- id numérico do imóvel na Hostex
  date date not null,                         -- noite fechada no calendário mestre
  reservation_code text not null,             -- reserva que justifica a data hoje
  kind text not null check (kind in ('checkin_minus_1', 'checkout')),
  created_at timestamptz not null default now(),
  released_at timestamptz,                    -- nulo = a data está fechada por este sistema
  event_id text,                              -- evento da Hostex que fechou
  released_event_id text,                     -- evento que liberou
  release_reason text,
  release_sent boolean not null default false, -- true = o sistema mandou reabrir na Hostex
  -- Segunda tranca do escopo: a lista é a mesma de IMOVEIS_LIMPEZA em
  -- supabase/functions/_shared/limpeza/calculo.ts. A linha é gravada antes da
  -- escrita na Hostex, então imóvel fora daqui não é escrito nem por engano.
  constraint cleaning_blocks_escopo check (property_id in (
    12673095, 12673096, 12673098, 12673103, 12673105, 12673106, 12673107, 12673108, 12673110,
    12673111, 12673116, 12673122, 12673126, 12673129, 12673132, 12673135, 12673140, 12673141
  ))
);

-- Uma linha ativa por imóvel e data: é o que impede dois eventos de fecharem
-- (ou reabrirem) a mesma data duas vezes.
create unique index if not exists cleaning_blocks_ativa_por_data
  on public.cleaning_blocks (property_id, date) where released_at is null;
create index if not exists cleaning_blocks_reserva_ativa
  on public.cleaning_blocks (reservation_code) where released_at is null;
create index if not exists cleaning_blocks_liberadas
  on public.cleaning_blocks (property_id, released_at) where released_at is not null;

alter table public.cleaning_blocks enable row level security;
drop policy if exists "Equipe lê cleaning_blocks" on public.cleaning_blocks;
create policy "Equipe lê cleaning_blocks" on public.cleaning_blocks
  for select to authenticated using (public.is_team_member(auth.uid()));

-- 2. Log por evento ------------------------------------------------------------
create table if not exists public.cleaning_block_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  origem text not null check (origem in ('webhook', 'manual')),
  event_id text,
  evento text,
  property_id bigint not null,
  reservation_code text not null,
  reservation_status text,                    -- status lido na API na hora
  check_in_date date,
  check_out_date date,
  modo text not null check (modo in ('simulacao', 'escrita')),
  -- processando -> (simulado | sem_acao | abortado | erro) ou
  -- processando -> verificando -> ok | reenviado -> ok | erro
  status text not null check (status in (
    'processando', 'simulado', 'sem_acao', 'abortado', 'verificando', 'reenviado', 'ok', 'erro'
  )),
  bloqueadas date[] not null default '{}',    -- fechadas (em simulado: fecharia)
  liberadas date[] not null default '{}',     -- reabertas (em simulado: reabriria)
  descartadas jsonb not null default '[]'::jsonb,  -- [{date, kind, acao, motivo}]
  so_registro jsonb not null default '[]'::jsonb,  -- linhas transferidas ou encerradas sem escrita
  esperado jsonb not null default '[]'::jsonb,     -- [{date, available, block_id}] para a verificação
  hostex_request_ids text[] not null default '{}',
  verificar_apos timestamptz,
  verificacao_tentativas integer not null default 0,
  verificado_em timestamptz,
  divergencias jsonb,
  erro text
);

create index if not exists cleaning_block_log_recentes on public.cleaning_block_log (created_at desc);
create index if not exists cleaning_block_log_reserva on public.cleaning_block_log (reservation_code);
create index if not exists cleaning_block_log_pendentes
  on public.cleaning_block_log (created_at) where status in ('processando', 'verificando', 'reenviado');

alter table public.cleaning_block_log enable row level security;
drop policy if exists "Equipe lê cleaning_block_log" on public.cleaning_block_log;
create policy "Equipe lê cleaning_block_log" on public.cleaning_block_log
  for select to authenticated using (public.is_team_member(auth.uid()));

-- O que pede atenção: erro, trava de segurança, ou verificação parada há mais de 15 min.
create or replace view public.cleaning_block_alertas
with (security_invoker = true) as
select l.id, l.created_at, l.property_id, l.reservation_code, l.evento, l.status,
       l.bloqueadas, l.liberadas, l.erro, l.divergencias
  from public.cleaning_block_log l
 where l.status in ('erro', 'abortado')
    or (l.status in ('processando', 'verificando', 'reenviado') and l.created_at < now() - interval '15 minutes')
 order by l.created_at desc;

-- 3. Trava por imóvel ----------------------------------------------------------
create table if not exists public.cleaning_block_locks (
  property_id bigint primary key,
  holder uuid not null,
  locked_until timestamptz not null
);
alter table public.cleaning_block_locks enable row level security;  -- sem policy: só service role

-- 4. Flag: nasce desligada ------------------------------------------------------
-- { "ativo": true|false, "modo": "simulacao"|"escrita", "imoveis": "todos"|[ids] }
-- "simulacao" roda tudo e só grava no log o que faria. A lista de imóveis nunca
-- sai dos 18 do escopo (o código filtra; a constraint acima tranca).
insert into public.system_config (key, value)
values ('limpeza_bloqueios', '{"ativo": false, "modo": "simulacao", "imoveis": []}'::jsonb)
on conflict (key) do nothing;

-- 5. Verificação de reserva (cron) ----------------------------------------------
-- A verificação normal roda no próprio processo do evento, ~20 s depois da
-- escrita. Este cron só acorda a function quando sobrou pendência (o processo
-- morreu no meio); sem pendência, não chama nada.
create or replace function public.disparar_verificacoes_limpeza()
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_pendentes integer;
  v_token text;
begin
  select count(*) into v_pendentes
    from public.cleaning_block_log
   where status in ('processando', 'verificando', 'reenviado')
     and created_at < now() - interval '2 minutes'
     and coalesce(verificar_apos, created_at) <= now();
  if v_pendentes = 0 then
    return 'nada pendente';
  end if;

  select decrypted_secret into v_token
    from vault.decrypted_secrets
   where name = 'notificar_cobranca_token';

  perform net.http_post(
    url     := 'https://ktzfovzwayfqczytmhno.supabase.co/functions/v1/hostex-webhook',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-token', coalesce(v_token, '')),
    body    := jsonb_build_object('limpeza', 'pendencias'),
    timeout_milliseconds := 60000
  );
  return v_pendentes || ' pendência(s)';
end;
$$;

revoke all on function public.disparar_verificacoes_limpeza() from public, anon, authenticated;

select cron.unschedule('limpeza-verificacao')
where exists (select 1 from cron.job where jobname = 'limpeza-verificacao');
select cron.schedule('limpeza-verificacao', '*/5 * * * *', 'select public.disparar_verificacoes_limpeza()');

-- 6. Reprocessar uma reserva à mão ----------------------------------------------
-- select public.limpeza_reprocessar('0-HMXXXXXXXX-xxxxxxxxxx');
-- Mesmas regras e mesma flag do evento; o resultado aparece em cleaning_block_log.
create or replace function public.limpeza_reprocessar(p_reservation_code text, p_property_id bigint default null)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_token text;
begin
  if coalesce(btrim(p_reservation_code), '') = '' then
    raise exception 'Informe o código da reserva.';
  end if;

  select decrypted_secret into v_token
    from vault.decrypted_secrets
   where name = 'notificar_cobranca_token';

  perform net.http_post(
    url     := 'https://ktzfovzwayfqczytmhno.supabase.co/functions/v1/hostex-webhook',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-token', coalesce(v_token, '')),
    body    := jsonb_build_object('limpeza', 'reprocessar', 'reservation_code', btrim(p_reservation_code), 'property_id', p_property_id),
    timeout_milliseconds := 60000
  );
  return 'pedido enviado: acompanhe em cleaning_block_log';
end;
$$;

revoke all on function public.limpeza_reprocessar(text, bigint) from public, anon, authenticated;
