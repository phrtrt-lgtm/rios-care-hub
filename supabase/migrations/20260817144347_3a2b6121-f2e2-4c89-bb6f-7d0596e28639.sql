UPDATE public.charges c
SET status = CASE WHEN c.due_date < CURRENT_DATE THEN 'overdue' ELSE 'sent' END,
    debited_at = NULL,
    updated_at = now()
FROM public.profiles p
WHERE p.id = c.owner_id
  AND p.name ILIKE '%Juliana%'
  AND c.status = 'debited'
  AND c.updated_at = '2026-08-17 14:26:44.371014+00'::timestamptz;