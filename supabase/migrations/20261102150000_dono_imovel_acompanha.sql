-- Quando o imóvel troca de proprietário, os itens abertos e os rascunhos de
-- cobrança seguem o dono novo (pedido do gestor em 2026-11-02).
--
-- Caso real: AUGUSTO e AUGUSTO2 foram registrados em 28/10 com a conta do
-- admin, os itens nasceram no mesmo dia e em 30/10 o dono passou a ser o
-- proprietário de verdade, em /propriedades. Os 25 itens e os 25 rascunhos
-- ficaram com o admin, e "Enviar ao proprietário" teria cobrado a conta
-- errada. Corrigidos à mão em 02/11; daqui em diante o gatilho cuida.
--
-- Regra: segue o dono novo todo ticket do imóvel que apontava para o dono
-- antigo, não arquivado, não cancelado e sem cobrança já lançada (enviada,
-- pendente, vencida, paga…); e todo rascunho de cobrança do imóvel que estava
-- com o dono antigo. Cobrança já lançada fica com quem a recebeu, e o ticket
-- dela também. Ticket de um terceiro (nem dono antigo nem novo) não muda.
--
-- Só a equipe troca o dono: o proprietário pode editar o próprio imóvel
-- (policy "Owners can update their properties", sem WITH CHECK), mas não
-- passá-lo a outra conta. Sem esse freio, o gatilho deixaria um proprietário
-- mandar os próprios rascunhos para a conta de outro.

create or replace function public.properties_dono_acompanha()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tickets integer := 0;
  v_rascunhos integer := 0;
begin
  if new.owner_id is not distinct from old.owner_id then
    return new;
  end if;

  if v_uid is not null and not public.is_team_member(v_uid) then
    raise exception 'Só a equipe troca o proprietário do imóvel.' using errcode = '42501';
  end if;

  update public.tickets t
     set owner_id = new.owner_id
   where t.property_id = new.id
     and t.owner_id = old.owner_id
     and t.archived_at is null
     and t.status <> 'cancelado'
     and not exists (
       select 1 from public.charges c
        where c.ticket_id = t.id and c.archived_at is null and c.status <> 'draft');
  get diagnostics v_tickets = row_count;

  update public.charges c
     set owner_id = new.owner_id
   where c.property_id = new.id
     and c.owner_id = old.owner_id
     and c.status = 'draft'
     and c.archived_at is null;
  get diagnostics v_rascunhos = row_count;

  raise notice 'Imóvel % trocou de dono: % tickets e % rascunhos seguiram.', new.name, v_tickets, v_rascunhos;
  return new;
end;
$$;

comment on function public.properties_dono_acompanha() is
  'Troca de dono do imóvel (só equipe): tickets abertos sem cobrança lançada e rascunhos de cobrança seguem o dono novo.';

drop trigger if exists trg_properties_dono_acompanha on public.properties;
create trigger trg_properties_dono_acompanha
  after update of owner_id on public.properties
  for each row
  when (old.owner_id is distinct from new.owner_id)
  execute function public.properties_dono_acompanha();
