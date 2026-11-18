-- Data da última coleta da Hostex que trouxe reservas, para o painel do
-- proprietário decidir se mostra os resultados (src/lib/coletaHostex.ts).
--
-- Em 2026-11-14 a leitura de hostex_sync_log passou a ser só da equipe
-- (drizzle/migrations/0003_restrict_sync_log_and_charge_attachments.sql).
-- O painel do proprietário lia a tabela direto: passou a receber zero linhas,
-- entendeu "coleta parada" e escondeu os resultados em /minha-caixa, o botão
-- do cartão do imóvel e o item da barra do celular.
--
-- A função devolve só a data. O log (contagens, mensagens de erro, quem
-- disparou) continua restrito à equipe.

create or replace function public.hostex_ultima_coleta()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $fn$
  select max(finished_at)
  from public.hostex_sync_log
  where status = 'ok'
    and reservations_upserted > 0
    and auth.uid() is not null;
$fn$;

comment on function public.hostex_ultima_coleta() is
  'Fim da última coleta da Hostex com reservas. Só a data; o log fica restrito à equipe.';

revoke all on function public.hostex_ultima_coleta() from public, anon;
grant execute on function public.hostex_ultima_coleta() to authenticated, service_role;
