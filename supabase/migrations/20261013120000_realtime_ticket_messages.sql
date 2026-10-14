-- Chat de chamados e manutenções: a tabela ticket_messages nunca entrou na
-- publicação do realtime, embora useMaintenanceChat e TicketDetalhes assinem
-- INSERT nela. Efeito: a mensagem enviada ficava "Enviando…" até reabrir a
-- conversa, e a resposta do outro lado só aparecia ao reabrir. O RLS da
-- tabela continua valendo para o realtime (cada um só recebe o que pode ler).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ticket_messages'
  ) then
    alter publication supabase_realtime add table public.ticket_messages;
  end if;
end $$;
