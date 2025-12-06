-- Add transcript_summary column for AI-generated summaries
ALTER TABLE public.cleaning_inspections 
ADD COLUMN IF NOT EXISTS transcript_summary text;