-- Replace cutlery_count with cutlery check fields
ALTER TABLE public.routine_inspection_checklists
DROP COLUMN IF EXISTS cutlery_count,
ADD COLUMN cutlery_ok text,
ADD COLUMN cutlery_notes text;