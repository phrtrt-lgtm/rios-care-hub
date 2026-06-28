UPDATE public.charges
SET status = 'debited', updated_at = now()
WHERE debited_at IS NOT NULL
  AND status NOT IN ('debited','arquivado','cancelled','pago_antecipado','pago_no_vencimento','pago_com_atraso')
  AND archived_at IS NULL
  AND owner_id = (SELECT id FROM public.profiles WHERE name ILIKE 'Nilson Maia' LIMIT 1);