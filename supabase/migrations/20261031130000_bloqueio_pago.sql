-- Bloqueio de datas pago pelo proprietário (PLANO_IA_AGENTE.md §4, Fase 5).
--
-- Antes: o proprietário pedia o bloqueio, anexava um comprovante da taxa de
-- limpeza (bucket público) e a equipe marcava "processado" sem tocar na
-- Hostex. Agora, para uso pessoal, o pedido nasce `aguardando_pagamento` com
-- um PIX do Mercado Pago no valor da taxa de limpeza do imóvel; o webhook
-- confirma o pagamento, confere o valor e bloqueia as noites na Hostex.
-- Pedido de manutenção continua como era (equipe decide).

alter table public.properties add column if not exists taxa_limpeza_cents integer;
comment on column public.properties.taxa_limpeza_cents is
  'Taxa de limpeza cobrada do proprietário no bloqueio para uso pessoal. Nula = pega da Hostex (cleaning_fee do anúncio) no primeiro pedido.';

alter table public.date_block_requests
  add column if not exists valor_cents integer,
  add column if not exists mercadopago_payment_id text,
  add column if not exists pix_qr_code text,
  add column if not exists pix_qr_code_base64 text,
  add column if not exists pix_expira_em timestamptz,
  add column if not exists pago_em timestamptz,
  add column if not exists hostex_request_id text,
  add column if not exists hostex_bloqueado_em timestamptz,
  add column if not exists erro_hostex text;

alter table public.date_block_requests drop constraint if exists date_block_requests_status_check;
alter table public.date_block_requests add constraint date_block_requests_status_check
  check (status in ('pending', 'processed', 'rejected', 'aguardando_pagamento', 'pago_pendente_hostex', 'expirado'));

create index if not exists idx_date_block_requests_status on public.date_block_requests (status, created_at desc);
create index if not exists idx_date_block_requests_imovel_datas on public.date_block_requests (property_id, start_date, end_date);
