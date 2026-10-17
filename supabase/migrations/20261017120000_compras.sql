-- Lista de compras: o que precisa ser comprado para cada imóvel, com o link
-- do produto. Mesmo modelo de `ajustes` (20261016120000_ajustes.sql):
-- - equipe (admin, agent, maintenance) e faxineiras pedem;
-- - a equipe vê tudo e marca como comprado / não vai comprar / reabre;
-- - a faxineira vê só os próprios pedidos (o nome de quem pediu e de quem
--   comprou fica gravado na linha, porque ela não lê perfis alheios);
-- - quem pediu apaga o próprio pedido enquanto está aberto; admin apaga qualquer um.

create table if not exists public.compras (
  id uuid primary key default gen_random_uuid(),
  -- nulo = geral (estoque, vários imóveis) ou imóvel fora da lista de quem pediu
  property_id uuid references public.properties(id) on delete set null,
  item text not null,
  quantidade integer not null default 1,
  -- link do produto (loja); só http/https
  link text,
  status text not null default 'pendente',
  autor_id uuid default auth.uid() references public.profiles(id) on delete set null,
  autor_nome text,
  resolvido_por uuid references public.profiles(id) on delete set null,
  resolvido_por_nome text,
  resolvido_em timestamptz,
  -- observação de quem resolveu ("chega quinta", "já tinha no estoque")
  resposta text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compras_status_check check (status in ('pendente', 'comprado', 'descartado')),
  constraint compras_item_check check (char_length(btrim(item)) between 2 and 200),
  constraint compras_quantidade_check check (quantidade between 1 and 999),
  constraint compras_link_check check (link is null or (link ~* '^https?://' and char_length(link) <= 2000)),
  constraint compras_resposta_check check (resposta is null or char_length(resposta) <= 1000)
);

create index if not exists idx_compras_status_criado on public.compras (status, created_at);
create index if not exists idx_compras_autor on public.compras (autor_id);
create index if not exists idx_compras_imovel on public.compras (property_id);

-- Autoria e resolução gravadas aqui, nunca pelo cliente.
create or replace function public.compras_preencher()
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

drop trigger if exists trg_compras_preencher on public.compras;
create trigger trg_compras_preencher
  before insert or update on public.compras
  for each row execute function public.compras_preencher();

alter table public.compras enable row level security;

revoke all on public.compras from anon;
grant select, insert, update, delete on public.compras to authenticated;
grant all on public.compras to service_role;

drop policy if exists "Equipe ve compras; autor ve as suas" on public.compras;
create policy "Equipe ve compras; autor ve as suas" on public.compras
  for select to authenticated
  using (public.is_team_member(auth.uid()) or autor_id = auth.uid());

drop policy if exists "Equipe e faxineiras pedem compras" on public.compras;
create policy "Equipe e faxineiras pedem compras" on public.compras
  for insert to authenticated
  with check (public.is_team_member(auth.uid()) or public.has_role(auth.uid(), 'cleaner'));

drop policy if exists "Equipe resolve compras" on public.compras;
create policy "Equipe resolve compras" on public.compras
  for update to authenticated
  using (public.is_team_member(auth.uid()))
  with check (public.is_team_member(auth.uid()));

drop policy if exists "Admin ou autor apaga compra aberta" on public.compras;
create policy "Admin ou autor apaga compra aberta" on public.compras
  for delete to authenticated
  using (public.has_role(auth.uid(), 'admin') or (autor_id = auth.uid() and status = 'pendente'));
