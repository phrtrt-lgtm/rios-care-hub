-- Lista de manutenções: as cobranças de cada ticket vêm embutidas na consulta
-- de tickets. Sem índice, cada ticket varria a tabela charges inteira.
-- Já aplicado em produção em 2026-10-01.
create index if not exists idx_charges_ticket_id
  on public.charges (ticket_id)
  where ticket_id is not null;
