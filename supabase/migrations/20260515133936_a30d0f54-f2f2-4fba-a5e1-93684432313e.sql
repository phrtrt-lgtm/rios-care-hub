
UPDATE public.charges
SET status = CASE
  WHEN due_date IS NULL THEN 'pago_no_vencimento'
  WHEN paid_at::date <= due_date - INTERVAL '2 days' THEN 'pago_antecipado'
  WHEN paid_at::date <= due_date THEN 'pago_no_vencimento'
  ELSE 'pago_com_atraso'
END,
updated_at = now()
WHERE paid_at IS NOT NULL
  AND status NOT IN ('pago_antecipado','pago_no_vencimento','pago_com_atraso','arquivado','debited','cancelled');
