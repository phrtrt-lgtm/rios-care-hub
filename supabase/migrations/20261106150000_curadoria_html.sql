-- Curadoria em HTML (proposta decorativa gerada pela skill proposta-decorativa), hospedada no portal e ligada ao proprietário.
-- É a mesma linha de owner_curations: o proprietário vê no banner de /minha-caixa e em /minha-curadoria, e a equipe em /admin/curadorias.
-- A diferença é que, com html_path preenchido, o conteúdo é o arquivo no bucket `curadorias`, aberto por /curadoria/:token.

alter table public.owner_curations
  add column if not exists html_path text,
  add column if not exists link_token text,
  add column if not exists pecas integer,
  add column if not exists aberturas integer not null default 0,
  add column if not exists primeira_abertura_em timestamptz,
  add column if not exists ultima_abertura_em timestamptz;

create unique index if not exists owner_curations_link_token_key
  on public.owner_curations (link_token)
  where link_token is not null;

-- Bucket público para quem tem o endereço (token de 128 bits na pasta), sem política de leitura para anônimo:
-- ninguém de fora consegue listar. O Storage serve HTML como text/plain, então a página nunca roda no domínio dele:
-- o portal lê o texto e mostra num iframe sandbox, sem acesso à sessão.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('curadorias', 'curadorias', true, 31457280, array['text/html'])
on conflict (id) do nothing;

drop policy if exists "Curadorias: equipe ve" on storage.objects;
create policy "Curadorias: equipe ve" on storage.objects for select to authenticated
  using (bucket_id = 'curadorias' and (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'agent'::app_role)));

drop policy if exists "Curadorias: equipe envia" on storage.objects;
create policy "Curadorias: equipe envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'curadorias' and (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'agent'::app_role)));

drop policy if exists "Curadorias: equipe atualiza" on storage.objects;
create policy "Curadorias: equipe atualiza" on storage.objects for update to authenticated
  using (bucket_id = 'curadorias' and (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'agent'::app_role)))
  with check (bucket_id = 'curadorias' and (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'agent'::app_role)));

drop policy if exists "Curadorias: equipe apaga" on storage.objects;
create policy "Curadorias: equipe apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'curadorias' and (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'agent'::app_role)));

-- Abrir pelo link, com ou sem login. Rascunho só abre para a equipe, e a equipe não conta como abertura.
create or replace function public.curadoria_por_link(p_token text)
returns table (titulo text, html_path text, imovel text)
language plpgsql
security definer
set search_path = public
as $$
declare
  equipe boolean := coalesce(public.is_team_member(auth.uid()), false);
  c record;
begin
  if p_token is null or length(p_token) < 16 or length(p_token) > 64 then
    return;
  end if;

  select oc.id, oc.title, oc.html_path, p.name as imovel
    into c
    from public.owner_curations oc
    left join public.properties p on p.id = oc.property_id
   where oc.link_token = p_token
     and oc.html_path is not null
     and (oc.status in ('published', 'paid') or equipe);

  if not found then
    return;
  end if;

  if not equipe then
    update public.owner_curations
       set aberturas = aberturas + 1,
           primeira_abertura_em = coalesce(primeira_abertura_em, now()),
           ultima_abertura_em = now()
     where id = c.id;
  end if;

  titulo := c.title;
  html_path := c.html_path;
  imovel := c.imovel;
  return next;
end;
$$;

revoke all on function public.curadoria_por_link(text) from public;
grant execute on function public.curadoria_por_link(text) to anon, authenticated;
