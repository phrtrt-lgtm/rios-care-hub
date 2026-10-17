-- 1) Tarefas da equipe de rua: o que alguém precisa ir fazer em um imóvel.
--    Só equipe (admin, agent, maintenance): todos veem, criam e resolvem;
--    apaga o admin, ou quem criou enquanto está pendente. Mesmo modelo de
--    `ajustes` e `compras` (trigger grava autoria e resolução).
--
-- 2) janela_imoveis(): para cada imóvel ativo, se está ocupado hoje, quando
--    o hóspede atual sai e quando entra o próximo. Usada na lista de
--    manutenções e nas tarefas de rua para saber quando dá para ir.

create table if not exists public.tarefas_rua (
  id uuid primary key default gen_random_uuid(),
  -- nulo = geral (vários imóveis, escritório, fornecedor)
  property_id uuid references public.properties(id) on delete set null,
  descricao text not null,
  status text not null default 'pendente',
  autor_id uuid default auth.uid() references public.profiles(id) on delete set null,
  autor_nome text,
  resolvido_por uuid references public.profiles(id) on delete set null,
  resolvido_por_nome text,
  resolvido_em timestamptz,
  resposta text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tarefas_rua_status_check check (status in ('pendente', 'feita', 'descartada')),
  constraint tarefas_rua_descricao_check check (char_length(btrim(descricao)) between 3 and 1000),
  constraint tarefas_rua_resposta_check check (resposta is null or char_length(resposta) <= 1000)
);

create index if not exists idx_tarefas_rua_status_criado on public.tarefas_rua (status, created_at);
create index if not exists idx_tarefas_rua_imovel on public.tarefas_rua (property_id);

create or replace function public.tarefas_rua_preencher()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if TG_OP = 'INSERT' then
    if v_uid is not null then
      new.autor_id := v_uid;
    end if;
    new.autor_nome := (select name from public.profiles where id = new.autor_id);
    new.status := 'pendente';
    new.resolvido_por := null;
    new.resolvido_por_nome := null;
    new.resolvido_em := null;
    new.resposta := null;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  new.autor_id := old.autor_id;
  new.autor_nome := old.autor_nome;
  new.created_at := old.created_at;
  new.updated_at := now();

  if new.status is distinct from old.status then
    if new.status = 'pendente' then
      new.resolvido_por := null;
      new.resolvido_por_nome := null;
      new.resolvido_em := null;
      new.resposta := null;
    else
      new.resolvido_por := coalesce(v_uid, new.resolvido_por);
      new.resolvido_por_nome := (select name from public.profiles where id = new.resolvido_por);
      new.resolvido_em := now();
    end if;
  else
    new.resolvido_por := old.resolvido_por;
    new.resolvido_por_nome := old.resolvido_por_nome;
    new.resolvido_em := old.resolvido_em;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tarefas_rua_preencher on public.tarefas_rua;
create trigger trg_tarefas_rua_preencher
  before insert or update on public.tarefas_rua
  for each row execute function public.tarefas_rua_preencher();

alter table public.tarefas_rua enable row level security;

revoke all on public.tarefas_rua from anon;
grant select, insert, update, delete on public.tarefas_rua to authenticated;
grant all on public.tarefas_rua to service_role;

drop policy if exists "Equipe ve tarefas de rua" on public.tarefas_rua;
create policy "Equipe ve tarefas de rua" on public.tarefas_rua
  for select to authenticated using (public.is_team_member(auth.uid()));

drop policy if exists "Equipe cria tarefas de rua" on public.tarefas_rua;
create policy "Equipe cria tarefas de rua" on public.tarefas_rua
  for insert to authenticated with check (public.is_team_member(auth.uid()));

drop policy if exists "Equipe resolve tarefas de rua" on public.tarefas_rua;
create policy "Equipe resolve tarefas de rua" on public.tarefas_rua
  for update to authenticated
  using (public.is_team_member(auth.uid()))
  with check (public.is_team_member(auth.uid()));

drop policy if exists "Admin ou autor apaga tarefa pendente" on public.tarefas_rua;
create policy "Admin ou autor apaga tarefa pendente" on public.tarefas_rua
  for delete to authenticated
  using (public.has_role(auth.uid(), 'admin') or (autor_id = auth.uid() and status = 'pendente'));

-- Estado e janela de cada imóvel. Só datas; nada de hóspede. Só para a
-- equipe (para os outros devolve vazio). "Hoje" é o dia em Brasília.
--   saida:             fim da estadia que inclui hoje (check-in <= hoje <= check-out);
--                      igual a hoje = sai hoje; nula = ninguém hoje.
--   proxima_entrada:   primeiro check-in a partir da saída (ou de hoje, se livre).
--   proximo_checkout:  a saída, se o hóspede ainda não sai hoje; senão, o
--                      check-out da próxima reserva.
create or replace function public.janela_imoveis()
returns table (property_id uuid, saida date, proxima_entrada date, proximo_checkout date)
language sql
stable
security definer
set search_path = public
as $$
  with hoje as (
    select (now() at time zone 'America/Sao_Paulo')::date as d
  ),
  r as (
    select h.property_id, h.check_in_date as ci, h.check_out_date as co
      from public.hostex_reservations h, hoje
     where h.status = 'accepted'
       and h.property_id is not null
       and h.check_out_date >= hoje.d
  ),
  atual as (
    select r.property_id, max(r.co) as saida
      from r, hoje
     where r.ci <= hoje.d and r.co >= hoje.d
     group by r.property_id
  ),
  base as (
    select p.id as property_id, a.saida,
           (select r.ci from r
             where r.property_id = p.id and r.ci >= coalesce(a.saida, (select d from hoje))
             order by r.ci limit 1) as prox_ci,
           (select r.co from r
             where r.property_id = p.id and r.ci >= coalesce(a.saida, (select d from hoje))
             order by r.ci limit 1) as prox_co
      from public.properties p
      left join atual a on a.property_id = p.id
     where p.archived_at is null
       and public.is_team_member(auth.uid())
  )
  select b.property_id, b.saida, b.prox_ci,
         case when b.saida > (select d from hoje) then b.saida else b.prox_co end
    from base b;
$$;

revoke all on function public.janela_imoveis() from public, anon;
grant execute on function public.janela_imoveis() to authenticated;
