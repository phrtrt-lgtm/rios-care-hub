-- Viabilização de imóveis novos (/novos-imoveis, §3.19 do CLAUDE.md).
--
-- Um registro por imóvel que a RIOS acabou de pegar: nome, endereço e
-- proprietário (mesmo antes da visita), a etapa em que está e as fotos da
-- visita. Os itens "o que fazer" NÃO ficam aqui: são tickets de manutenção
-- do imóvel (tickets.property_id), para continuarem com conversa, anexos,
-- cobrança ao proprietário e WhatsApp pelo caminho que já existe. Enquanto a
-- viabilização está aberta, esses tickets aparecem no quadro "Novos imóveis"
-- da lista de manutenções.
--
-- `property_id` fica nulo enquanto o proprietário não tem conta no portal
-- (properties.owner_id é obrigatório); nesse caso só dá para anotar, não
-- para listar itens. Só a equipe (admin, agent, maintenance) vê e mexe.

create table if not exists public.viabilizacoes (
  id uuid primary key default gen_random_uuid(),
  -- imóvel no portal; nulo enquanto o proprietário ainda não tem conta
  property_id uuid unique references public.properties(id) on delete set null,
  -- apelido do imóvel (vira properties.name ao criar o imóvel)
  nome text not null,
  endereco text,
  proprietario_nome text,
  proprietario_telefone text,
  proprietario_email text,
  etapa text not null default 'captado',
  visita_em date,
  estreia_prevista date,
  observacoes text,
  -- fotos e vídeos da visita (bucket privado `ajustes`, pasta <autor>/<id>/)
  anexos text[] not null default '{}',
  autor_id uuid default auth.uid() references public.profiles(id) on delete set null,
  autor_nome text,
  concluida_em timestamptz,
  concluida_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint viabilizacoes_etapa_check check (etapa in ('captado', 'visita', 'preparacao', 'pronto', 'no_ar', 'desistiu')),
  constraint viabilizacoes_nome_check check (char_length(btrim(nome)) between 2 and 80),
  constraint viabilizacoes_endereco_check check (endereco is null or char_length(endereco) <= 300),
  constraint viabilizacoes_proprietario_nome_check check (proprietario_nome is null or char_length(proprietario_nome) <= 120),
  constraint viabilizacoes_proprietario_telefone_check check (proprietario_telefone is null or char_length(proprietario_telefone) <= 40),
  constraint viabilizacoes_proprietario_email_check check (proprietario_email is null or char_length(proprietario_email) <= 160),
  constraint viabilizacoes_observacoes_check check (observacoes is null or char_length(observacoes) <= 4000),
  constraint viabilizacoes_anexos_check check (coalesce(array_length(anexos, 1), 0) <= 10)
);

create index if not exists idx_viabilizacoes_etapa_criado on public.viabilizacoes (etapa, created_at);

-- Autoria e conclusão gravadas aqui, nunca pelo cliente. Mudar a etapa para
-- "no_ar" ou "desistiu" conclui; voltar para uma etapa aberta reabre.
create or replace function public.viabilizacoes_preencher()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_final boolean := new.etapa in ('no_ar', 'desistiu');
begin
  new.nome := btrim(new.nome);

  if TG_OP = 'INSERT' then
    if v_uid is not null then
      new.autor_id := v_uid;
    end if;
    new.autor_nome := (select name from public.profiles where id = new.autor_id);
    new.created_at := now();
    new.updated_at := now();
    if v_final then
      new.concluida_em := now();
      new.concluida_por_nome := (select name from public.profiles where id = v_uid);
    else
      new.concluida_em := null;
      new.concluida_por_nome := null;
    end if;
    return new;
  end if;

  new.autor_id := old.autor_id;
  new.autor_nome := old.autor_nome;
  new.created_at := old.created_at;
  new.updated_at := now();

  if new.etapa is distinct from old.etapa then
    if v_final then
      new.concluida_em := now();
      new.concluida_por_nome := (select name from public.profiles where id = v_uid);
    else
      new.concluida_em := null;
      new.concluida_por_nome := null;
    end if;
  else
    new.concluida_em := old.concluida_em;
    new.concluida_por_nome := old.concluida_por_nome;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_viabilizacoes_preencher on public.viabilizacoes;
create trigger trg_viabilizacoes_preencher
  before insert or update on public.viabilizacoes
  for each row execute function public.viabilizacoes_preencher();

alter table public.viabilizacoes enable row level security;

revoke all on public.viabilizacoes from anon;
grant select, insert, update, delete on public.viabilizacoes to authenticated;
grant all on public.viabilizacoes to service_role;

drop policy if exists "Equipe ve viabilizacoes" on public.viabilizacoes;
create policy "Equipe ve viabilizacoes" on public.viabilizacoes
  for select to authenticated using (public.is_team_member(auth.uid()));

drop policy if exists "Equipe cria viabilizacoes" on public.viabilizacoes;
create policy "Equipe cria viabilizacoes" on public.viabilizacoes
  for insert to authenticated with check (public.is_team_member(auth.uid()));

drop policy if exists "Equipe atualiza viabilizacoes" on public.viabilizacoes;
create policy "Equipe atualiza viabilizacoes" on public.viabilizacoes
  for update to authenticated
  using (public.is_team_member(auth.uid()))
  with check (public.is_team_member(auth.uid()));

drop policy if exists "Admin ou autor apaga viabilizacao" on public.viabilizacoes;
create policy "Admin ou autor apaga viabilizacao" on public.viabilizacoes
  for delete to authenticated
  using (public.has_role(auth.uid(), 'admin') or autor_id = auth.uid());
