-- Create table to track payment score history
CREATE TABLE public.owner_payment_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  charge_id UUID REFERENCES public.charges(id) ON DELETE SET NULL,
  score_before INTEGER NOT NULL,
  score_after INTEGER NOT NULL,
  points_change INTEGER NOT NULL,
  reason TEXT NOT NULL, -- 'early_payment', 'on_time_payment', 'late_payment', 'reserve_debit'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add current score to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS payment_score INTEGER NOT NULL DEFAULT 80;

-- Enable RLS
ALTER TABLE public.owner_payment_scores ENABLE ROW LEVEL SECURITY;

-- Owners can view their own score history
CREATE POLICY "Owners can view their score history"
ON public.owner_payment_scores
FOR SELECT
USING (auth.uid() = owner_id);

-- Team can view all score history
CREATE POLICY "Team can view all score history"
ON public.owner_payment_scores
FOR SELECT
USING (is_team_member(auth.uid()));

-- Team can create score entries
CREATE POLICY "Team can create score entries"
ON public.owner_payment_scores
FOR INSERT
WITH CHECK (is_team_member(auth.uid()));

-- Create index for faster lookups
CREATE INDEX idx_owner_payment_scores_owner_id ON public.owner_payment_scores(owner_id);
CREATE INDEX idx_owner_payment_scores_created_at ON public.owner_payment_scores(created_at DESC);