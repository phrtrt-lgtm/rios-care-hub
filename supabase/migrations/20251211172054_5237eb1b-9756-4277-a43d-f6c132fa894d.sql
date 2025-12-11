-- Drop the old check constraint and add a new one with all valid statuses
ALTER TABLE public.charges DROP CONSTRAINT IF EXISTS charges_status_check;

ALTER TABLE public.charges ADD CONSTRAINT charges_status_check 
CHECK (status IN ('draft', 'sent', 'overdue', 'pago_antecipado', 'pago_no_vencimento', 'pago_com_atraso', 'debited', 'cancelled'));