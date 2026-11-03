-- Unificar itens de imóvel novo (pedido do gestor, 2026-11-02; CLAUDE.md §3.19):
-- "comprei vários itens em uma compra só e cobro em um lugar". Vários tickets
-- de manutenção do mesmo imóvel viram um ticket novo, que recebe os anexos e
-- as conversas deles; os originais ficam cancelados e arquivados, apontando
-- para o novo em `unificado_em`. Depois o envio ao proprietário é o de
-- sempre (`enviarAoProprietario`), uma vez só.

alter table public.tickets
  add column if not exists unificado_em uuid references public.tickets(id) on delete set null;

create index if not exists idx_tickets_unificado_em
  on public.tickets (unificado_em) where unificado_em is not null;

comment on column public.tickets.unificado_em is
  'Ticket que absorveu este na unificação (/novos-imoveis). O original fica cancelado e arquivado.';

create or replace function public.unificar_manutencoes(
  p_ids uuid[],
  p_subject text,
  p_natureza text default 'manutencao',
  p_cost_responsible text default 'owner',
  p_amount_cents integer default null,
  p_management_contribution_cents integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ids uuid[];
  v_subject text := nullif(btrim(coalesce(p_subject, '')), '');
  v_n integer;
  v_n_imoveis integer;
  v_property uuid;
  v_owner uuid;
  v_todos_feitos boolean;
  v_valor integer;
  v_aporte integer;
  v_categoria text;
  v_lista text;
  v_descricao text;
  v_novo uuid;
begin
  if v_uid is null or not public.is_team_member(v_uid) then
    raise exception 'Só a equipe pode unificar itens.' using errcode = '42501';
  end if;

  select array_agg(distinct x) into v_ids from unnest(p_ids) as x where x is not null;
  if v_ids is null or array_length(v_ids, 1) < 2 then
    raise exception 'Selecione pelo menos dois itens para unificar.' using errcode = '22023';
  end if;
  if v_subject is null or length(v_subject) < 2 then
    raise exception 'Dê um nome ao item unificado.' using errcode = '22023';
  end if;
  v_subject := left(v_subject, 200);
  if p_natureza not in ('manutencao', 'compra') then
    raise exception 'Tipo inválido: use manutencao ou compra.' using errcode = '22023';
  end if;
  if p_cost_responsible not in ('owner', 'pm', 'guest', 'pending') then
    raise exception 'Responsável pelo custo inválido.' using errcode = '22023';
  end if;
  if coalesce(p_amount_cents, 0) < 0 or coalesce(p_management_contribution_cents, 0) < 0 then
    raise exception 'Valor e aporte não podem ser negativos.' using errcode = '22023';
  end if;

  -- Trava os originais: dois cliques ao mesmo tempo não unificam duas vezes.
  perform 1 from public.tickets where id = any(v_ids) for update;

  select count(*),
         count(distinct property_id),
         (array_agg(property_id))[1],
         bool_and(status = 'concluido')
    into v_n, v_n_imoveis, v_property, v_todos_feitos
    from public.tickets
   where id = any(v_ids)
     and ticket_type = 'manutencao'
     and archived_at is null
     and status <> 'cancelado'
     and unificado_em is null;

  if v_n <> array_length(v_ids, 1) then
    raise exception 'Algum item não existe mais, já foi arquivado, cancelado ou unificado. Recarregue a página.' using errcode = '22023';
  end if;
  if v_property is null or v_n_imoveis <> 1 then
    raise exception 'Os itens precisam ser do mesmo imóvel.' using errcode = '22023';
  end if;
  -- O dono é o do imóvel hoje: ticket antigo pode guardar o dono de antes de
  -- a conta certa ser vinculada, e a cobrança tem que ir para quem é dono.
  select owner_id into v_owner from public.properties where id = v_property;
  if v_owner is null then
    raise exception 'O imóvel não tem proprietário no portal.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.charges c
     where c.ticket_id = any(v_ids) and c.status <> 'draft' and c.archived_at is null
  ) then
    raise exception 'Item já enviado ao proprietário não pode ser unificado.' using errcode = '22023';
  end if;

  -- Valor de cada item como a tela mostra: rascunho de cobrança mais recente,
  -- senão o rascunho do ticket. A lista entra na descrição do item novo.
  with itens as (
    select t.id, t.subject, t.description, t.created_at,
           coalesce(
             (select c.amount_cents from public.charges c
               where c.ticket_id = t.id and c.archived_at is null
               order by c.created_at desc limit 1),
             t.charge_draft_amount_cents, 0) as valor,
           coalesce(
             (select c.management_contribution_cents from public.charges c
               where c.ticket_id = t.id and c.archived_at is null
               order by c.created_at desc limit 1),
             t.charge_draft_management_contribution_cents, 0) as aporte
      from public.tickets t
     where t.id = any(v_ids)
  )
  select sum(valor)::integer,
         sum(aporte)::integer,
         string_agg(
           '- ' || subject
             || case when valor > 0
                  then ' (R$ ' || translate(to_char(valor / 100.0, 'FM999G999G999G990D00'), ',.', '.,') || ')'
                  else '' end
             || case when nullif(btrim(coalesce(description, '')), '') is not null
                      and btrim(description) <> btrim(subject)
                  then E'\n  ' || btrim(description)
                  else '' end,
           E'\n' order by created_at, array_position(p_ids, id))
    into v_valor, v_aporte, v_lista
    from itens;

  if p_natureza = 'compra' then
    v_categoria := 'itens';
  else
    select min(charge_draft_category) into v_categoria
      from public.tickets
     where id = any(v_ids) and charge_draft_category is not null and charge_draft_category <> 'itens'
    having count(distinct charge_draft_category) = 1;
  end if;

  v_descricao := v_subject || E'\n\nItens unificados em '
    || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || E':\n' || coalesce(v_lista, '');

  insert into public.tickets (
    owner_id, property_id, ticket_type, subject, description, status, created_by,
    kind, essential, cost_responsible, natureza,
    charge_draft_amount_cents, charge_draft_management_contribution_cents,
    charge_draft_title, charge_draft_category
  ) values (
    v_owner, v_property, 'manutencao', v_subject, v_descricao,
    (case when v_todos_feitos then 'concluido' else 'novo' end)::public.ticket_status,
    v_uid, 'maintenance', true, p_cost_responsible, p_natureza,
    nullif(coalesce(p_amount_cents, v_valor), 0),
    nullif(coalesce(p_management_contribution_cents, v_aporte), 0),
    v_subject, v_categoria
  ) returning id into v_novo;

  -- Anexos e conversas passam para o item novo; o aviso de conclusão ainda
  -- não enviado também, para o proprietário saber o que foi feito.
  update public.ticket_attachments set ticket_id = v_novo where ticket_id = any(v_ids);
  update public.ticket_messages set ticket_id = v_novo where ticket_id = any(v_ids);
  update public.viabilizacao_avisos set ticket_id = v_novo where ticket_id = any(v_ids) and status = 'pendente';

  -- Rascunhos de cobrança dos originais saem de cena (nenhum foi enviado).
  update public.charges set archived_at = now()
   where ticket_id = any(v_ids) and status = 'draft' and archived_at is null;

  update public.tickets
     set status = 'cancelado', archived_at = now(), unificado_em = v_novo
   where id = any(v_ids);

  return v_novo;
end;
$$;

comment on function public.unificar_manutencoes(uuid[], text, text, text, integer, integer) is
  'Junta vários itens (tickets de manutenção) do mesmo imóvel num ticket novo, movendo anexos e conversas; os originais ficam cancelados e arquivados com unificado_em. Só equipe.';

revoke all on function public.unificar_manutencoes(uuid[], text, text, text, integer, integer) from public;
grant execute on function public.unificar_manutencoes(uuid[], text, text, text, integer, integer) to authenticated;
