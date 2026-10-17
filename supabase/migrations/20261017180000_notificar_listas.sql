-- WhatsApp ao responsável quando entra item novo nas listas da equipe
-- (pedido do gestor, 2026-10-17):
--   ajustes          -> gestor (Paulo)
--   compras na rua   -> Kaique; compras online -> gestor
--   tarefas de rua   -> quem vai cuidar (padrão: Kaique), com o estado do
--                       imóvel hoje e o próximo check-out
--
-- Quem recebe fica em system_config 'listas_whatsapp' (a equipe lê; a tela de
-- tarefas usa o responsável padrão). Ninguém recebe aviso do que ele mesmo criou.
-- O envio é da edge function notificar-listas, chamada por trigger via pg_net
-- com o token interno do Vault (o mesmo da notificar-cobranca). Ela usa o
-- modelo genérico `notificacao_rios` da central de WhatsApp: nada novo no Meta.
-- Falha no aviso nunca bloqueia a gravação.

-- 1. Compra na rua ou online ------------------------------------------------
alter table public.compras add column if not exists canal text not null default 'rua';
alter table public.compras drop constraint if exists compras_canal_check;
alter table public.compras add constraint compras_canal_check check (canal in ('rua', 'online'));

-- 2. Quem cuida da tarefa de rua ---------------------------------------------
alter table public.tarefas_rua add column if not exists responsavel_id uuid references public.profiles(id) on delete set null;
alter table public.tarefas_rua add column if not exists responsavel_nome text;

-- 3. Resultado do aviso (para a tela mostrar se saiu) ------------------------
alter table public.ajustes add column if not exists notificacao_status text;
alter table public.ajustes add column if not exists notificacao_em timestamptz;
alter table public.ajustes add column if not exists notificacao_erro text;
alter table public.compras add column if not exists notificacao_status text;
alter table public.compras add column if not exists notificacao_em timestamptz;
alter table public.compras add column if not exists notificacao_erro text;
alter table public.tarefas_rua add column if not exists notificacao_status text;
alter table public.tarefas_rua add column if not exists notificacao_em timestamptz;
alter table public.tarefas_rua add column if not exists notificacao_erro text;

-- 4. Configuração de quem recebe ---------------------------------------------
insert into public.system_config (key, value)
select 'listas_whatsapp', jsonb_build_object(
  'ativo', true,
  'ajustes', jsonb_build_array(jsonb_build_object('perfil', '5b4ee355-ee08-4003-89e0-d3efc4ba78a3', 'telefone', '5522988014013')),
  'compras_online', jsonb_build_array(jsonb_build_object('perfil', '5b4ee355-ee08-4003-89e0-d3efc4ba78a3', 'telefone', '5522988014013')),
  'compras_rua', jsonb_build_array(jsonb_build_object('perfil', 'f9d54058-fd30-4dd9-9634-eb7bbeb6c818')),
  'tarefas_rua_padrao', 'f9d54058-fd30-4dd9-9634-eb7bbeb6c818'
)
where not exists (select 1 from public.system_config where key = 'listas_whatsapp');

-- 5. Trigger das tarefas: responsável padrão e nome gravado -------------------
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
    if new.responsavel_id is null then
      new.responsavel_id := nullif(
        (select value ->> 'tarefas_rua_padrao' from public.system_config where key = 'listas_whatsapp'), ''
      )::uuid;
    end if;
    new.responsavel_nome := (select name from public.profiles where id = new.responsavel_id);
    new.status := 'pendente';
    new.resolvido_por := null;
    new.resolvido_por_nome := null;
    new.resolvido_em := null;
    new.resposta := null;
    new.notificacao_status := null;
    new.notificacao_em := null;
    new.notificacao_erro := null;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  new.autor_id := old.autor_id;
  new.autor_nome := old.autor_nome;
  new.created_at := old.created_at;
  new.updated_at := now();
  if new.responsavel_id is distinct from old.responsavel_id then
    new.responsavel_nome := (select name from public.profiles where id = new.responsavel_id);
  end if;

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

-- 6. A edge function (service role) também lê o estado dos imóveis ------------
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
       and (public.is_team_member(auth.uid()) or auth.role() = 'service_role')
  )
  select b.property_id, b.saida, b.prox_ci,
         case when b.saida > (select d from hoje) then b.saida else b.prox_co end
    from base b;
$$;

revoke all on function public.janela_imoveis() from public, anon;
grant execute on function public.janela_imoveis() to authenticated, service_role;

-- 7. Disparo: um trigger genérico para as três tabelas ------------------------
create or replace function public.trg_notificar_lista_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_token text;
begin
  begin
    select decrypted_secret into v_token
      from vault.decrypted_secrets where name = 'notificar_cobranca_token';
    perform net.http_post(
      url := 'https://ktzfovzwayfqczytmhno.supabase.co/functions/v1/notificar-listas',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-token', coalesce(v_token, '')),
      body := jsonb_build_object('tabela', TG_TABLE_NAME, 'id', NEW.id)
    );
  exception when others then
    raise warning 'notificar-listas: falha ao agendar (%)', sqlerrm;
  end;
  return NEW;
end;
$$;

drop trigger if exists trg_notificar_ajuste_whatsapp on public.ajustes;
create trigger trg_notificar_ajuste_whatsapp after insert on public.ajustes
  for each row execute function public.trg_notificar_lista_whatsapp();

drop trigger if exists trg_notificar_compra_whatsapp on public.compras;
create trigger trg_notificar_compra_whatsapp after insert on public.compras
  for each row execute function public.trg_notificar_lista_whatsapp();

drop trigger if exists trg_notificar_tarefa_whatsapp on public.tarefas_rua;
create trigger trg_notificar_tarefa_whatsapp after insert on public.tarefas_rua
  for each row execute function public.trg_notificar_lista_whatsapp();
