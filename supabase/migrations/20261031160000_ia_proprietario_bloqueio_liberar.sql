-- Fase 2 do assistente de IA (proprietário) e liberação de bloqueio pelo
-- proprietário. PLANO_IA_AGENTE.md §3 e §4; CLAUDE.md §3.20, §3.21 e §8.16.
--
-- 1. hostex_properties: a policy "auth read hostex_properties" (qual = true)
--    deixava qualquer usuário autenticado ler todas as propriedades da Hostex.
--    Agora: equipe, ou quem tem acesso ao imóvel vinculado.
-- 2. hostex_reservations: a policy "Owners can read own hostex_reservations"
--    entregava a linha inteira (guest_name, raw com telefone e e-mail). Sai.
--    No lugar, a view hostex_reservations_proprietario, só com datas, canal,
--    noites e valores, filtrada por has_property_access.
-- 3. ia_agente_liberado(): o front pergunta se o assistente está ligado para
--    o papel do usuário sem precisar ler system_config (que é só da equipe).
-- 4. date_block_requests: status `liberado` (o proprietário liberou as noites
--    na Hostex) e `cancelado` (retirou o pedido antes de ser processado).

-- 1. hostex_properties -------------------------------------------------------
drop policy if exists "auth read hostex_properties" on public.hostex_properties;
create policy "hostex_properties: equipe ou dono" on public.hostex_properties
  for select to authenticated
  using (
    public.is_team_member(auth.uid())
    or (property_id is not null and public.has_property_access(auth.uid(), property_id))
  );

-- 2. hostex_reservations -----------------------------------------------------
drop policy if exists "Owners can read own hostex_reservations" on public.hostex_reservations;

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
  r.synced_at
from public.hostex_reservations r
where r.property_id is not null
  and public.has_property_access(auth.uid(), r.property_id);

comment on view public.hostex_reservations_proprietario is
  'Reservas da Hostex sem dado pessoal de hóspede, só dos imóveis que o usuário acessa (has_property_access). É o que o proprietário e o assistente de IA leem.';

revoke all on public.hostex_reservations_proprietario from public, anon;
grant select on public.hostex_reservations_proprietario to authenticated;

-- 3. ia_agente_liberado() ----------------------------------------------------
create or replace function public.ia_agente_liberado()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (c.value->>'ativo')::boolean
      and coalesce(
        (c.value->'papeis'->>p.role::text)::boolean,
        p.role::text in ('admin', 'agent', 'maintenance')
      ),
    false
  )
  from public.profiles p
  left join lateral (
    select value from public.system_config where key = 'ia_agente' limit 1
  ) c on true
  where p.id = auth.uid();
$$;

comment on function public.ia_agente_liberado() is
  'true quando system_config.ia_agente está ativo e o papel do usuário logado está ligado em papeis. Para o widget do assistente decidir se aparece.';

revoke all on function public.ia_agente_liberado() from public;
grant execute on function public.ia_agente_liberado() to authenticated;

-- 4. date_block_requests -----------------------------------------------------
alter table public.date_block_requests drop constraint if exists date_block_requests_status_check;
alter table public.date_block_requests add constraint date_block_requests_status_check
  check (status in (
    'pending', 'processed', 'rejected', 'aguardando_pagamento', 'pago_pendente_hostex', 'expirado',
    'liberado', 'cancelado'
  ));

alter table public.date_block_requests
  add column if not exists liberado_em timestamptz,
  add column if not exists liberado_por uuid,
  add column if not exists hostex_liberado_em timestamptz,
  add column if not exists hostex_liberacao_request_id text;

comment on column public.date_block_requests.liberado_em is
  'Quando o proprietário (ou a equipe) liberou as noites deste bloqueio na Hostex, pela function liberar-bloqueio. A taxa paga não é devolvida automaticamente.';
