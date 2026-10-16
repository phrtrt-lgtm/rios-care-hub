-- Ajustes: o que a equipe vê de errado em anúncio, ficha, mensagens
-- automáticas e roupa de cama. Antes ia pelo WhatsApp do gestor e se perdia;
-- agora fica numa lista (/ajustes) até alguém marcar como feito.
--
-- Quem faz o quê:
-- - equipe (admin, agent, maintenance) e faxineiras avisam;
-- - a equipe vê tudo e marca como feito / sem mudança / reabre;
-- - a faxineira vê só os próprios avisos (não lê perfis nem imóveis alheios,
--   por isso o nome de quem avisou e de quem resolveu fica gravado na linha);
-- - quem avisou apaga o próprio aviso enquanto está aberto; admin apaga qualquer um.
--
-- Fotos e prints vão para o bucket privado `ajustes`, na pasta
-- <id do autor>/<id do ajuste>/, e são lidas por URL assinada. Não usam o
-- bucket público `attachments` (ver ROADMAP 1.14): print de conversa pode
-- trazer nome e telefone de hóspede.

create table if not exists public.ajustes (
  id uuid primary key default gen_random_uuid(),
  -- nulo = geral (vale para todos) ou imóvel fora da lista de quem avisou
  property_id uuid references public.properties(id) on delete set null,
  categoria text not null,
  descricao text not null,
  urgente boolean not null default false,
  -- caminhos no bucket `ajustes`
  fotos text[] not null default '{}',
  status text not null default 'aberto',
  autor_id uuid default auth.uid() references public.profiles(id) on delete set null,
  autor_nome text,
  resolvido_por uuid references public.profiles(id) on delete set null,
  resolvido_por_nome text,
  resolvido_em timestamptz,
  -- observação de quem resolveu ("ajustei no Airbnb e na Hostex")
  resposta text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ajustes_categoria_check
    check (categoria in ('anuncio', 'ficha', 'mensagens', 'roupa_de_cama', 'outro')),
  constraint ajustes_status_check
    check (status in ('aberto', 'feito', 'descartado')),
  constraint ajustes_descricao_check
    check (char_length(btrim(descricao)) between 3 and 2000),
  constraint ajustes_fotos_check
    check (cardinality(fotos) <= 6),
  constraint ajustes_resposta_check
    check (resposta is null or char_length(resposta) <= 1000)
);

create index if not exists idx_ajustes_status_criado on public.ajustes (status, created_at);
create index if not exists idx_ajustes_autor on public.ajustes (autor_id);
create index if not exists idx_ajustes_imovel on public.ajustes (property_id);

-- Autoria e resolução são preenchidas aqui, nunca pelo cliente: quem avisa
-- não escolhe o próprio nome, e "feito por" é sempre quem mudou o status.
create or replace function public.ajustes_preencher()
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
    new.status := 'aberto';
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
    if new.status = 'aberto' then
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

drop trigger if exists trg_ajustes_preencher on public.ajustes;
create trigger trg_ajustes_preencher
  before insert or update on public.ajustes
  for each row execute function public.ajustes_preencher();

alter table public.ajustes enable row level security;

revoke all on public.ajustes from anon;
grant select, insert, update, delete on public.ajustes to authenticated;
grant all on public.ajustes to service_role;

drop policy if exists "Equipe ve ajustes; autor ve os seus" on public.ajustes;
create policy "Equipe ve ajustes; autor ve os seus" on public.ajustes
  for select to authenticated
  using (public.is_team_member(auth.uid()) or autor_id = auth.uid());

drop policy if exists "Equipe e faxineiras avisam ajustes" on public.ajustes;
create policy "Equipe e faxineiras avisam ajustes" on public.ajustes
  for insert to authenticated
  with check (public.is_team_member(auth.uid()) or public.has_role(auth.uid(), 'cleaner'));

drop policy if exists "Equipe resolve ajustes" on public.ajustes;
create policy "Equipe resolve ajustes" on public.ajustes
  for update to authenticated
  using (public.is_team_member(auth.uid()))
  with check (public.is_team_member(auth.uid()));

drop policy if exists "Admin ou autor apaga ajuste aberto" on public.ajustes;
create policy "Admin ou autor apaga ajuste aberto" on public.ajustes
  for delete to authenticated
  using (public.has_role(auth.uid(), 'admin') or (autor_id = auth.uid() and status = 'aberto'));

-- Fotos: bucket privado, só imagem, até 15 MB (a foto já sai reduzida do
-- aparelho; o limite cobre a original quando a redução falha, como HEIC).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ajustes',
  'ajustes',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

drop policy if exists "Ajustes: equipe e faxineiras enviam fotos" on storage.objects;
create policy "Ajustes: equipe e faxineiras enviam fotos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ajustes'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (public.is_team_member(auth.uid()) or public.has_role(auth.uid(), 'cleaner'))
  );

drop policy if exists "Ajustes: equipe ve fotos; autor ve as suas" on storage.objects;
create policy "Ajustes: equipe ve fotos; autor ve as suas" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'ajustes'
    and (public.is_team_member(auth.uid()) or (storage.foldername(name))[1] = auth.uid()::text)
  );

drop policy if exists "Ajustes: admin ou autor apaga fotos" on storage.objects;
create policy "Ajustes: admin ou autor apaga fotos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'ajustes'
    and (public.has_role(auth.uid(), 'admin') or (storage.foldername(name))[1] = auth.uid()::text)
  );
