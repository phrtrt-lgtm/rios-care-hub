-- Item de imóvel novo: compra ou manutenção (pedido do gestor, 2026-10-28;
-- CLAUDE.md §3.19). A compra continua sendo um ticket de manutenção do
-- imóvel (mesmo envio ao proprietário, mesma cobrança), mas não entra na
-- lista de manutenções da equipe: ali fica só o que é manutenção, para o
-- funcionário de manutenção enxergar só o trabalho dele. A compra o gestor
-- vê e resolve em /novos-imoveis; o proprietário vê as duas, com etiqueta.
alter table public.tickets
  add column if not exists natureza text not null default 'manutencao';

alter table public.tickets drop constraint if exists tickets_natureza_check;
alter table public.tickets
  add constraint tickets_natureza_check check (natureza in ('manutencao', 'compra'));

comment on column public.tickets.natureza is
  'Natureza do item de manutenção: manutencao (lista da equipe) ou compra (só em /novos-imoveis e para o proprietário).';

-- O e-mail de conclusão ao proprietário (§3.19) é de manutenção: a compra
-- avisa pela cobrança, quando o gestor compra e envia.
create or replace function public.ticket_enfileirar_aviso_viabilizacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viab uuid;
begin
  if TG_OP <> 'UPDATE' then
    return new;
  end if;
  -- Só a passagem para concluído; reabrir e concluir de novo avisa de novo.
  if new.status <> 'concluido' or old.status is not distinct from 'concluido' then
    return new;
  end if;
  if new.property_id is null or new.ticket_type <> 'manutencao' or new.archived_at is not null then
    return new;
  end if;
  -- Compra: o proprietário é avisado pela cobrança, não por este e-mail.
  if coalesce(new.natureza, 'manutencao') <> 'manutencao' then
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
   limit 1;
  if v_viab is null then
    return new;
  end if;

  insert into public.viabilizacao_avisos (viabilizacao_id, tipo, referencia, ticket_id)
  values (v_viab, 'item_feito', left(new.subject, 160), new.id);
  return new;
exception when others then
  raise warning 'viabilizacao_avisos: % (ticket %)', sqlerrm, new.id;
  return new;
end;
$$;
