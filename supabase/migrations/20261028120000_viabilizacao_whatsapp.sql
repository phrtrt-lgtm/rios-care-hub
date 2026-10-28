-- WhatsApp ao proprietário a cada movimentação do imóvel novo (pedido do
-- gestor, 2026-10-28; CLAUDE.md §3.19).
--
-- O que avisa:
--   * etapa que AVANÇA (visita marcada, em preparação, pronto, no ar);
--     voltar etapa ou desistir não avisa;
--   * visita marcada/remarcada e estreia prevista, quando mudam sem a etapa mudar;
--   * item novo, item concluído e cobrança enviada (ticket de manutenção do
--     imóvel, ou cobrança avulsa do imóvel), só de imóvel que já passou de
--     "captado" e só o que o proprietário vê (custo de hóspede/em espera, não).
--
-- Como avisa: os triggers só ENFILEIRAM em viabilizacao_avisos. O cron
-- viabilizacao-whatsapp (a cada 5 min) junta o que está pendente por imóvel
-- num lote e pede o envio à edge function notificar-listas
-- ({lote_viabilizacao}), via pg_net com o token interno do Vault. Etapa,
-- visita e estreia saem no próximo tique; item espera `agrupar_minutos` (10)
-- para virar UMA mensagem (colar uma lista cria vários tickets de uma vez).
-- A function monta o texto, manda pelo modelo genérico `notificacao_rios`
-- (nada novo no Meta) e grava o resultado nos avisos do lote.
--
-- Controles: viabilizacoes.avisar_proprietario (por imóvel, nasce ligado) e
-- system_config 'viabilizacao_whatsapp' {ativo, agrupar_minutos} (geral).
-- Telefone: viabilizacoes.proprietario_telefone, senão o do perfil do dono,
-- senão properties.owner_phone. Sem telefone, o aviso espera (a tela mostra)
-- e expira em 24 h. Falha nunca bloqueia a gravação de nada.

-- 1. Liga/desliga por imóvel --------------------------------------------------
alter table public.viabilizacoes
  add column if not exists avisar_proprietario boolean not null default true;

-- 2. Fila de avisos ------------------------------------------------------------
create table if not exists public.viabilizacao_avisos (
  id uuid primary key default gen_random_uuid(),
  viabilizacao_id uuid not null references public.viabilizacoes(id) on delete cascade,
  tipo text not null check (tipo in ('etapa', 'visita', 'estreia', 'item_novo', 'item_feito', 'item_enviado')),
  -- etapa nova, data (aaaa-mm-dd) ou o assunto do item
  referencia text,
  ticket_id uuid references public.tickets(id) on delete cascade,
  -- item_enviado: o que o proprietário paga (valor - aporte)
  valor_cents integer,
  status text not null default 'pendente'
    check (status in ('pendente', 'disparado', 'enviado', 'falhou', 'sem_destino', 'desligado')),
  lote_id uuid,
  tentativas integer not null default 0,
  disparado_em timestamptz,
  enviado_em timestamptz,
  telefone text,
  erro text,
  created_at timestamptz not null default now()
);

create index if not exists idx_viabilizacao_avisos_viab on public.viabilizacao_avisos (viabilizacao_id, created_at desc);
create index if not exists idx_viabilizacao_avisos_fila on public.viabilizacao_avisos (status, created_at)
  where status in ('pendente', 'disparado');
create index if not exists idx_viabilizacao_avisos_lote on public.viabilizacao_avisos (lote_id);

alter table public.viabilizacao_avisos enable row level security;

-- Só leitura pela equipe (a tela mostra se o proprietário foi avisado).
-- Quem escreve são os triggers (definer) e a function (service role).
drop policy if exists "Equipe ve avisos de viabilizacao" on public.viabilizacao_avisos;
create policy "Equipe ve avisos de viabilizacao" on public.viabilizacao_avisos
  for select to authenticated using (public.is_team_member(auth.uid()));

revoke all on public.viabilizacao_avisos from anon;
grant select on public.viabilizacao_avisos to authenticated;
grant all on public.viabilizacao_avisos to service_role;

-- 3. Para quem vai: nome, telefone e imóvel -----------------------------------
-- Usada pelo cron (para só disparar quem tem telefone) e pela function.
-- Sem checagem de papel: só service role e as funções definer chamam.
create or replace function public.viabilizacao_destino(p_id uuid)
returns table (nome text, telefone text, imovel text, tem_conta boolean)
language sql
stable
security definer
set search_path = public
as $$
  with v as (
    select v.id, v.nome, v.property_id, v.proprietario_nome, v.proprietario_telefone,
           p.name as imovel_nome, p.owner_phone, pr.name as dono_nome, pr.phone as dono_phone
      from public.viabilizacoes v
      left join public.properties p on p.id = v.property_id
      left join public.profiles pr on pr.id = p.owner_id
     where v.id = p_id
  ),
  tel as (
    select v.*,
           (select x.d
              from (
                select regexp_replace(coalesce(u.t, ''), '\D', '', 'g') as d, u.o
                  from unnest(array[v.proprietario_telefone, v.dono_phone, v.owner_phone]) with ordinality as u(t, o)
              ) x
             where length(x.d) >= 10
             order by x.o
             limit 1) as digitos
      from v
  )
  select coalesce(nullif(trim(t.proprietario_nome), ''), t.dono_nome) as nome,
         case
           when t.digitos is null then null
           when length(t.digitos) <= 11 then '55' || t.digitos
           else t.digitos
         end as telefone,
         coalesce(t.imovel_nome, t.nome) as imovel,
         t.property_id is not null as tem_conta
    from tel t;
$$;

revoke all on function public.viabilizacao_destino(uuid) from public, anon, authenticated;
grant execute on function public.viabilizacao_destino(uuid) to service_role;

-- 4. Enfileirar: etapa, visita e estreia --------------------------------------
create or replace function public.viabilizacao_enfileirar_aviso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ordem constant text[] := array['captado', 'visita', 'preparacao', 'pronto', 'no_ar'];
  v_antes integer;
  v_depois integer;
begin
  if not new.avisar_proprietario then
    return new;
  end if;
  v_depois := array_position(v_ordem, new.etapa);

  if TG_OP = 'INSERT' then
    -- Registrar já adiantado (visita marcada, em preparação) conta como avanço.
    if new.etapa in ('visita', 'preparacao', 'pronto') then
      insert into public.viabilizacao_avisos (viabilizacao_id, tipo, referencia)
      values (new.id, 'etapa', new.etapa);
    end if;
    return new;
  end if;

  if new.etapa is distinct from old.etapa then
    v_antes := array_position(v_ordem, old.etapa);
    -- Só avanço avisa; voltar etapa ou desistir, não.
    -- A mensagem de etapa já leva a visita e a estreia, então nada mais entra aqui.
    if v_depois is not null and v_antes is not null and v_depois > v_antes then
      insert into public.viabilizacao_avisos (viabilizacao_id, tipo, referencia)
      values (new.id, 'etapa', new.etapa);
    end if;
    return new;
  end if;

  if new.visita_em is distinct from old.visita_em and new.visita_em is not null
     and new.etapa in ('captado', 'visita') then
    insert into public.viabilizacao_avisos (viabilizacao_id, tipo, referencia)
    values (new.id, 'visita', new.visita_em::text);
  end if;
  if new.estreia_prevista is distinct from old.estreia_prevista and new.estreia_prevista is not null
     and new.etapa in ('visita', 'preparacao', 'pronto') then
    insert into public.viabilizacao_avisos (viabilizacao_id, tipo, referencia)
    values (new.id, 'estreia', new.estreia_prevista::text);
  end if;
  return new;
exception when others then
  raise warning 'viabilizacao_avisos: % (viabilizacao %)', sqlerrm, new.id;
  return new;
end;
$$;

drop trigger if exists trg_viabilizacao_avisar on public.viabilizacoes;
create trigger trg_viabilizacao_avisar
  after insert or update of etapa, visita_em, estreia_prevista on public.viabilizacoes
  for each row execute function public.viabilizacao_enfileirar_aviso();

-- 5. Enfileirar: itens (tickets de manutenção do imóvel) ----------------------
create or replace function public.ticket_enfileirar_aviso_viabilizacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viab uuid;
begin
  if new.property_id is null or new.ticket_type <> 'manutencao' or new.archived_at is not null then
    return new;
  end if;
  -- Custo de hóspede ou em espera: o proprietário não vê o item, então não é avisado.
  if coalesce(new.cost_responsible, 'owner') in ('pending', 'guest') then
    return new;
  end if;

  select v.id into v_viab
    from public.viabilizacoes v
   where v.property_id = new.property_id
     and v.concluida_em is null
     and v.avisar_proprietario
     and v.etapa <> 'captado'
   limit 1;
  if v_viab is null then
    return new;
  end if;

  if TG_OP = 'INSERT' then
    if new.status not in ('concluido', 'cancelado') then
      insert into public.viabilizacao_avisos (viabilizacao_id, tipo, referencia, ticket_id)
      values (v_viab, 'item_novo', left(new.subject, 160), new.id);
    end if;
  elsif new.status = 'concluido' and old.status is distinct from 'concluido' then
    insert into public.viabilizacao_avisos (viabilizacao_id, tipo, referencia, ticket_id)
    values (v_viab, 'item_feito', left(new.subject, 160), new.id);
  end if;
  return new;
exception when others then
  raise warning 'viabilizacao_avisos: % (ticket %)', sqlerrm, new.id;
  return new;
end;
$$;

drop trigger if exists trg_ticket_avisar_viabilizacao on public.tickets;
create trigger trg_ticket_avisar_viabilizacao
  after insert or update of status on public.tickets
  for each row execute function public.ticket_enfileirar_aviso_viabilizacao();

-- 6. Enfileirar: cobrança enviada ---------------------------------------------
-- Quando a cobrança nasce lançada ou sai do rascunho (é o que o proprietário
-- recebe). Com ticket, o item é o do ticket; sem ticket, é a cobrança avulsa
-- do imóvel. Na mesma mensagem, "enviado" vence "feito" do mesmo item.
create or replace function public.charge_enfileirar_aviso_viabilizacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viab uuid;
  v_property uuid := new.property_id;
  v_ticket_id uuid;
  v_titulo text := new.title;
begin
  if new.archived_at is not null or new.status = 'draft' then
    return new;
  end if;
  if TG_OP = 'UPDATE' and old.status <> 'draft' then
    return new;
  end if;

  if new.ticket_id is not null then
    select t.id, coalesce(t.property_id, new.property_id), coalesce(t.subject, new.title)
      into v_ticket_id, v_property, v_titulo
      from public.tickets t
     where t.id = new.ticket_id;
  end if;
  if v_property is null then
    return new;
  end if;

  select v.id into v_viab
    from public.viabilizacoes v
   where v.property_id = v_property
     and v.concluida_em is null
     and v.avisar_proprietario
     and v.etapa <> 'captado'
   limit 1;
  if v_viab is null then
    return new;
  end if;

  insert into public.viabilizacao_avisos (viabilizacao_id, tipo, referencia, ticket_id, valor_cents)
  values (v_viab, 'item_enviado', left(coalesce(v_titulo, 'Cobrança'), 160), v_ticket_id,
          greatest(coalesce(new.amount_cents, 0) - coalesce(new.management_contribution_cents, 0), 0));
  return new;
exception when others then
  raise warning 'viabilizacao_avisos: % (cobranca %)', sqlerrm, new.id;
  return new;
end;
$$;

drop trigger if exists trg_charge_avisar_viabilizacao on public.charges;
create trigger trg_charge_avisar_viabilizacao
  after insert or update of status on public.charges
  for each row execute function public.charge_enfileirar_aviso_viabilizacao();

-- 7. Configuração geral ---------------------------------------------------------
insert into public.system_config (key, value)
select 'viabilizacao_whatsapp', jsonb_build_object('ativo', true, 'agrupar_minutos', 10)
where not exists (select 1 from public.system_config where key = 'viabilizacao_whatsapp');

-- 8. Disparo em lote (cron a cada 5 min) --------------------------------------
create or replace function public.disparar_avisos_viabilizacao()
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_cfg jsonb;
  v_minutos integer;
  v_token text;
  v_lote uuid;
  v_alvo record;
  v_lotes integer := 0;
begin
  select value into v_cfg from public.system_config where key = 'viabilizacao_whatsapp';
  if not coalesce((v_cfg ->> 'ativo')::boolean, true) then
    update public.viabilizacao_avisos set status = 'desligado' where status = 'pendente';
    return 'desligado';
  end if;
  v_minutos := greatest(coalesce((v_cfg ->> 'agrupar_minutos')::integer, 10), 0);

  -- Lote disparado sem resposta em 30 min: volta à fila até 3 vezes, depois falha.
  update public.viabilizacao_avisos
     set status = 'pendente'
   where status = 'disparado' and disparado_em < now() - interval '30 minutes' and tentativas < 3;
  update public.viabilizacao_avisos
     set status = 'falhou', erro = 'A função de envio não respondeu.'
   where status = 'disparado' and disparado_em < now() - interval '30 minutes' and tentativas >= 3;

  -- Imóvel que desligou o aviso: o que estava na fila não sai.
  update public.viabilizacao_avisos a
     set status = 'desligado'
    from public.viabilizacoes v
   where v.id = a.viabilizacao_id and a.status = 'pendente' and not v.avisar_proprietario;

  -- Pendente há mais de 24 h (sem telefone, por exemplo) não vai mais.
  update public.viabilizacao_avisos a
     set status = case when d.telefone is null then 'sem_destino' else 'falhou' end,
         erro = case when d.telefone is null then 'Sem WhatsApp do proprietário.' else 'Aviso expirou sem envio.' end
    from (
      select a2.id, d2.telefone
        from public.viabilizacao_avisos a2
        cross join lateral public.viabilizacao_destino(a2.viabilizacao_id) d2
       where a2.status = 'pendente' and a2.created_at < now() - interval '24 hours'
    ) d
   where a.id = d.id;

  select decrypted_secret into v_token
    from vault.decrypted_secrets
   where name = 'notificar_cobranca_token';

  -- Um lote por imóvel: etapa/visita/estreia vão já; itens esperam agrupar_minutos.
  for v_alvo in
    select a.viabilizacao_id
      from public.viabilizacao_avisos a
      cross join lateral public.viabilizacao_destino(a.viabilizacao_id) d
     where a.status = 'pendente'
       and d.telefone is not null
     group by a.viabilizacao_id
    having bool_or(a.tipo in ('etapa', 'visita', 'estreia'))
        or min(a.created_at) <= now() - make_interval(mins => v_minutos)
  loop
    v_lote := gen_random_uuid();
    update public.viabilizacao_avisos
       set status = 'disparado', lote_id = v_lote, disparado_em = now(), tentativas = tentativas + 1
     where viabilizacao_id = v_alvo.viabilizacao_id and status = 'pendente';
    perform net.http_post(
      url     := 'https://ktzfovzwayfqczytmhno.supabase.co/functions/v1/notificar-listas',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-token', coalesce(v_token, '')),
      body    := jsonb_build_object('lote_viabilizacao', v_lote),
      timeout_milliseconds := 60000
    );
    v_lotes := v_lotes + 1;
  end loop;
  return v_lotes || ' lote(s)';
end;
$$;

revoke all on function public.disparar_avisos_viabilizacao() from public, anon, authenticated;

select cron.unschedule('viabilizacao-whatsapp')
where exists (select 1 from cron.job where jobname = 'viabilizacao-whatsapp');
select cron.schedule('viabilizacao-whatsapp', '*/5 * * * *', 'select public.disparar_avisos_viabilizacao()');
