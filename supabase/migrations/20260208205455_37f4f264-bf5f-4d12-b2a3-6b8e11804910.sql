-- Add stove/oven check to routine inspection checklists
ALTER TABLE public.routine_inspection_checklists
ADD COLUMN stove_oven_working text,
ADD COLUMN stove_oven_notes text;