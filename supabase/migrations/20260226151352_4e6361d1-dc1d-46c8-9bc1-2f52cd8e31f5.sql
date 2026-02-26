
ALTER TABLE public.charges DROP CONSTRAINT IF EXISTS charges_status_check;

ALTER TABLE public.charges ADD CONSTRAINT charges_status_check 
CHECK (status IN (
  'draft',
  'sent',
  'pendente',
  'overdue',
  'pago_antecipado',
  'pago_no_vencimento',
  'pago_com_atraso',
  'debited',
  'cancelled',
  'paid',
  'aguardando_reserva',
  'arquivado'
));
