-- Bloqueio de datas do proprietário: três modos de limpeza (pedidos do gestor
-- em 2026-11-10, CLAUDE.md §3.21).
--
-- Até aqui o proprietário só bloqueava para uso pessoal pagando a taxa de
-- limpeza por PIX. Agora ele escolhe entre:
--   pix            paga a taxa de limpeza por PIX (o fluxo de sempre);
--   entrega_limpo  não paga agora: a RIOS limpa antes da entrada, ele devolve
--                  o imóvel limpo para os próximos hóspedes e se compromete a
--                  pagar a taxa de limpeza se a RIOS julgar o imóvel inadequado;
--   sem_limpeza    não paga: aceita receber o imóvel sem limpeza antes da
--                  entrada, e a limpeza é feita só na saída.
-- Nos dois modos sem PIX o pedido vira reserva direta na Hostex na hora, cada
-- um num canal personalizado próprio (é o que a equipe de limpeza lê no app):
--   entrega_limpo  "PROPRIETÁRIO - PEDIU PRA LIMPAR E DISSE QUE IA ENTREGAR LIMPO(NÃO PAGOU TAXA)"
--   sem_limpeza    "PROPRIETÁRIO - NÃO PEDIU LIMPEZA/LIMPAR NA SAÍDA"
--
-- O pedido continua em date_block_requests (reason = family_visit):
--   limpeza            o modo; 'pix' em todas as linhas antigas (em bloqueio de
--                      manutenção a coluna não quer dizer nada);
--   limpeza_aceito_em  quando ele concordou com o termo do modo (caixa marcada
--                      no diálogo ou cartão confirmado no assistente).
-- Em entrega_limpo, valor_cents guarda a taxa de limpeza do imóvel no dia do
-- pedido (o valor do compromisso), e pago_em fica nulo: nada foi pago.

alter table public.date_block_requests
  add column if not exists limpeza text not null default 'pix',
  add column if not exists limpeza_aceito_em timestamptz;

alter table public.date_block_requests drop constraint if exists date_block_requests_limpeza_check;
alter table public.date_block_requests add constraint date_block_requests_limpeza_check
  check (limpeza in ('pix', 'entrega_limpo', 'sem_limpeza'));

comment on column public.date_block_requests.limpeza is
  'Modo de limpeza do uso pessoal: pix (paga a taxa por PIX), entrega_limpo (RIOS limpa antes, o proprietário devolve limpo e só paga a taxa se a RIOS julgar o imóvel inadequado; valor_cents = taxa do compromisso) ou sem_limpeza (não paga e recebe o imóvel sem limpeza antes da entrada; limpeza só na saída). Sem sentido em bloqueio de manutenção.';
comment on column public.date_block_requests.limpeza_aceito_em is
  'Quando o proprietário concordou com o termo do modo entrega_limpo ou sem_limpeza (caixa marcada no diálogo de bloqueio ou cartão confirmado no assistente).';
