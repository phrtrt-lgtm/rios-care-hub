-- Lembrete de cobrança em atraso por WhatsApp (modelo cobranca_atraso_proprietario).
--
-- UM lembrete por PROPRIETÁRIO, com o resumo de todas as cobranças dele em
-- atraso (quantidade, total, vencimento mais antigo). Em 25/09/2026 eram 104
-- cobranças vencidas de 26 proprietários — uma mensagem por cobrança mandaria
-- ~8 WhatsApps seguidos para a mesma pessoa.
--
-- * charges.whatsapp_lembrete_*: resultado do último lembrete que incluiu a
--   cobrança (o aviso de "cobrança enviada" continua em whatsapp_*).
-- * whatsapp_lembrete_config: liga/desliga o envio automático e define o ritmo.
--   Nasce DESLIGADO. Só admin altera; a equipe lê.
-- * cobrancas_em_atraso(): a definição única de "em atraso com saldo a pagar".
-- * proprietarios_para_lembrete_atraso(): quem recebe na próxima rodada.
-- * disparar_lembretes_atraso_whatsapp(): chamado pelo cron diário; se ligado,
--   pede um lote à notificar-cobranca, que envia um por vez com intervalo.

alter table public.charges
  add column if not exists whatsapp_lembrete_status text
    check (whatsapp_lembrete_status in ('enviado', 'falhou', 'desativado')),
  add column if not exists whatsapp_lembrete_enviado_em timestamptz,
  add column if not exists whatsapp_lembrete_erro text,
  add column if not exists whatsapp_lembretes_enviados integer not null default 0;

create table if not exists public.whatsapp_lembrete_config (
  id boolean primary key default true check (id),
  ativo boolean not null default false,
  intervalo_dias integer not null default 7 check (intervalo_dias between 1 and 60),
  max_lembretes integer not null default 3 check (max_lembretes between 1 and 20),
  -- proprietários (= mensagens) por rodada diária
  max_por_dia integer not null default 20 check (max_por_dia between 1 and 40),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

insert into public.whatsapp_lembrete_config (id) values (true) on conflict do nothing;

alter table public.whatsapp_lembrete_config enable row level security;

drop policy if exists "Equipe le config de lembrete" on public.whatsapp_lembrete_config;
create policy "Equipe le config de lembrete" on public.whatsapp_lembrete_config
  for select to authenticated using (public.is_team_member(auth.uid()));

drop policy if exists "Admin altera config de lembrete" on public.whatsapp_lembrete_config;
create policy "Admin altera config de lembrete" on public.whatsapp_lembrete_config
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));

drop function if exists public.cobrancas_para_lembrete_atraso(integer);

-- Em atraso: o dia do vencimento já passou (fuso do Brasil), sem pagamento,
-- com saldo a pagar. Fica de fora o que já está em débito na reserva, foi
-- contestado ou está com comprovante em análise.
create or replace function public.cobrancas_em_atraso(p_owner uuid default null)
returns table (
  id uuid,
  owner_id uuid,
  a_pagar_cents bigint,
  due_date date,
  whatsapp_lembretes_enviados integer,
  whatsapp_lembrete_enviado_em timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
         c.owner_id,
         (c.amount_cents - coalesce(c.management_contribution_cents, 0) - coalesce(c.credit_applied_cents, 0))::bigint,
         c.due_date,
         c.whatsapp_lembretes_enviados,
         c.whatsapp_lembrete_enviado_em
  from public.charges c
  where (auth.role() = 'service_role' or public.is_team_member(auth.uid()))
    and (p_owner is null or c.owner_id = p_owner)
    and c.owner_id is not null
    and c.archived_at is null
    and c.paid_at is null
    and (
      c.status in ('overdue', 'debit_notice_sent')
      or (c.status in ('sent', 'pendente')
          and c.due_date < (now() at time zone 'America/Sao_Paulo')::date)
    )
    and c.amount_cents - coalesce(c.management_contribution_cents, 0) - coalesce(c.credit_applied_cents, 0) > 0;
$$;

revoke all on function public.cobrancas_em_atraso(uuid) from public, anon;
grant execute on function public.cobrancas_em_atraso(uuid) to authenticated, service_role;

-- Recebe na rodada quem tem WhatsApp ligado e ao menos uma cobrança em atraso
-- que ainda não passou do máximo de lembretes e cujo último lembrete foi há
-- intervalo_dias ou mais. Quem nunca recebeu vai primeiro.
create or replace function public.proprietarios_para_lembrete_atraso(p_limite integer default null)
returns table (owner_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select a.owner_id
  from public.cobrancas_em_atraso() a
  join public.profiles p on p.id = a.owner_id
  cross join public.whatsapp_lembrete_config cfg
  where p.notificar_whatsapp
    and a.whatsapp_lembretes_enviados < cfg.max_lembretes
    and (
      a.whatsapp_lembrete_enviado_em is null
      or (a.whatsapp_lembrete_enviado_em at time zone 'America/Sao_Paulo')::date
         <= (now() at time zone 'America/Sao_Paulo')::date - cfg.intervalo_dias
    )
  group by a.owner_id
  order by max(a.whatsapp_lembrete_enviado_em) nulls first, min(a.due_date)
  limit coalesce(p_limite, (select max_por_dia from public.whatsapp_lembrete_config));
$$;

revoke all on function public.proprietarios_para_lembrete_atraso(integer) from public, anon;
grant execute on function public.proprietarios_para_lembrete_atraso(integer) to authenticated, service_role;

-- Chamado pelo cron. Desligado = não faz nada.
create or replace function public.disparar_lembretes_atraso_whatsapp()
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_ativo boolean;
  v_token text;
begin
  select ativo into v_ativo from public.whatsapp_lembrete_config;
  if not coalesce(v_ativo, false) then
    return 'desligado';
  end if;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'notificar_cobranca_token';

  perform net.http_post(
    url     := 'https://ktzfovzwayfqczytmhno.supabase.co/functions/v1/notificar-cobranca',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-token', v_token),
    body    := jsonb_build_object('lote_atraso', true),
    timeout_milliseconds := 300000
  );
  return 'lote pedido';
end;
$$;

revoke all on function public.disparar_lembretes_atraso_whatsapp() from public, anon, authenticated;

-- Todo dia às 10h (Brasília) = 13h UTC.
select cron.unschedule('whatsapp-lembrete-atraso')
where exists (select 1 from cron.job where jobname = 'whatsapp-lembrete-atraso');
select cron.schedule('whatsapp-lembrete-atraso', '0 13 * * *', 'select public.disparar_lembretes_atraso_whatsapp()');
