-- O proprietário de imóvel novo vê a preparação no painel dele (pedido do
-- gestor, 2026-10-28; CLAUDE.md §3.19). Só ver e conversar: sem botão de
-- decisão, a RIOS executa sem esperar; a decisão fica no diálogo e a equipe
-- registra na lista.
--
-- A tabela viabilizacoes continua só da equipe. O proprietário lê por esta
-- função, que devolve só o que é dele (dono ou membro do imóvel) e só o que
-- ele pode ver: nada de observações internas, telefone digitado, fotos da
-- visita ou autor. Viabilização concluída (no ar ou desistência) some daqui.
create or replace function public.minhas_viabilizacoes()
returns table (
  id uuid,
  property_id uuid,
  nome text,
  etapa text,
  visita_em date,
  estreia_prevista date,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.property_id, coalesce(p.name, v.nome), v.etapa, v.visita_em, v.estreia_prevista, v.created_at
    from public.viabilizacoes v
    join public.properties p on p.id = v.property_id
   where v.concluida_em is null
     and p.archived_at is null
     and public.has_property_access(auth.uid(), v.property_id)
   order by v.created_at;
$$;

revoke all on function public.minhas_viabilizacoes() from public, anon;
grant execute on function public.minhas_viabilizacoes() to authenticated, service_role;
