ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS default_commission_percentage numeric;

-- Seed defaults from April 2026 financial reports (most recent commission per property)
UPDATE public.properties p
SET default_commission_percentage = sub.commission_percentage
FROM (
  SELECT DISTINCT ON (property_id) property_id, commission_percentage
  FROM public.financial_reports
  WHERE property_id IS NOT NULL
    AND period_start >= '2026-04-01'
    AND period_start < '2026-05-01'
  ORDER BY property_id, created_at DESC
) sub
WHERE p.id = sub.property_id;