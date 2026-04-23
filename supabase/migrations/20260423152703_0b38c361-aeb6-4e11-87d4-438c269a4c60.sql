-- Atualizar vistorias marcadas como OK que possuem anexos -> NÃO
UPDATE public.cleaning_inspections
SET notes = 'NÃO'
WHERE notes = 'OK'
  AND archived_at IS NULL
  AND id IN (
    SELECT DISTINCT inspection_id
    FROM public.cleaning_inspection_attachments
  );