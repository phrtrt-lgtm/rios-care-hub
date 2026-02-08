-- Create table for routine inspection checklists
CREATE TABLE public.routine_inspection_checklists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inspection_id UUID NOT NULL REFERENCES public.cleaning_inspections(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Serviços realizados
  ac_filters_cleaned BOOLEAN DEFAULT false,
  batteries_replaced BOOLEAN DEFAULT false,
  
  -- Verificações de funcionamento
  ac_working TEXT CHECK (ac_working IN ('ok', 'problema', 'na')),
  ac_notes TEXT,
  
  tv_internet_working TEXT CHECK (tv_internet_working IN ('ok', 'problema', 'na')),
  tv_internet_notes TEXT,
  
  outlets_switches_working TEXT CHECK (outlets_switches_working IN ('ok', 'problema', 'na')),
  outlets_switches_notes TEXT,
  
  doors_locks_working TEXT CHECK (doors_locks_working IN ('ok', 'problema', 'na')),
  doors_locks_notes TEXT,
  
  curtains_rods_working TEXT CHECK (curtains_rods_working IN ('ok', 'problema', 'na')),
  curtains_rods_notes TEXT,
  
  bathroom_working TEXT CHECK (bathroom_working IN ('ok', 'problema', 'na')),
  bathroom_notes TEXT,
  
  furniture_working TEXT CHECK (furniture_working IN ('ok', 'problema', 'na')),
  furniture_notes TEXT,
  
  kitchen_working TEXT CHECK (kitchen_working IN ('ok', 'problema', 'na')),
  kitchen_notes TEXT,
  
  -- Contagens
  glasses_count INTEGER,
  pillows_count INTEGER
);

-- Enable RLS
ALTER TABLE public.routine_inspection_checklists ENABLE ROW LEVEL SECURITY;

-- Policies for team members
CREATE POLICY "Team members can view routine checklists"
ON public.routine_inspection_checklists
FOR SELECT
USING (public.is_team_member(auth.uid()));

CREATE POLICY "Team members can create routine checklists"
ON public.routine_inspection_checklists
FOR INSERT
WITH CHECK (public.is_team_member(auth.uid()));

CREATE POLICY "Team members can update routine checklists"
ON public.routine_inspection_checklists
FOR UPDATE
USING (public.is_team_member(auth.uid()));

CREATE POLICY "Team members can delete routine checklists"
ON public.routine_inspection_checklists
FOR DELETE
USING (public.is_team_member(auth.uid()));

-- Add is_routine flag to cleaning_inspections
ALTER TABLE public.cleaning_inspections 
ADD COLUMN is_routine BOOLEAN DEFAULT false;

-- Create index for faster lookups
CREATE INDEX idx_routine_checklists_inspection ON public.routine_inspection_checklists(inspection_id);