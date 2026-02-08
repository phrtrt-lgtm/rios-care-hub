-- Add cutlery count to routine inspection checklists
ALTER TABLE public.routine_inspection_checklists
ADD COLUMN cutlery_count integer;