-- Drop the existing check constraint and recreate with all status values
ALTER TABLE public.charges DROP CONSTRAINT IF EXISTS charges_status_check;

ALTER TABLE public.charges ADD CONSTRAINT charges_status_check 
CHECK (status IN ('pendente', 'pago', 'contestado', 'cancelado', 'arquivado', 'aguardando_reserva', 'debited', 'pago_antecipado', 'overdue', 'pago_no_vencimento'));